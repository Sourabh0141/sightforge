"""Tests for Inference Service Webhook Trigger & Callback Contract Wiring (P3 U6, R38, R47, R83)."""

import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch

import pytest
from sightforge_inference.endpoint import (
    calculate_job_cost,
    compute_callback_signature,
    emit_complete_callback,
    emit_progress_callback,
    execute_job_orchestration,
    trigger_inference,
    upload_artifact_to_storage,
    upload_result_to_storage,
)


def test_compute_callback_signature() -> None:
    """Verifies HMAC-SHA256 signature computation over ${timestamp}.${body} (R46, AE12)."""
    secret = "sightforge-secret-key"
    timestamp = 1725200000
    raw_body = json.dumps({"jobId": "test-job-1", "framesCompleted": 10})

    expected_sig = (
        hmac.new(
            secret.encode("utf-8"),
            f"{timestamp}.{raw_body}".encode(),
            hashlib.sha256,
        )
        .hexdigest()
        .lower()
    )

    actual_sig = compute_callback_signature(secret, timestamp, raw_body)
    assert actual_sig == expected_sig


def test_emit_progress_callback() -> None:
    """Verifies progress callback POST with HMAC authentication headers (R31, KTD12)."""
    mock_resp = MagicMock()
    mock_resp.ok = True

    with patch("requests.post", return_value=mock_resp) as mock_post:
        success = emit_progress_callback(
            callback_base_url="https://events.sightforge.dev",
            secret="test-secret",
            job_id="job-prog-1",
            frames_completed=15,
            frames_total=30,
            delivery_id="delivery-uuid-1",
        )
        assert success is True
        mock_post.assert_called_once()
        url = mock_post.call_args[0][0]
        assert url == "https://events.sightforge.dev/callbacks/progress"
        headers = mock_post.call_args[1]["headers"]
        assert "Modal-Signature" in headers
        assert "Modal-Timestamp" in headers


def test_emit_complete_callback() -> None:
    """Verifies complete callback POST with execution metrics (R46, KTD8)."""
    mock_resp = MagicMock()
    mock_resp.ok = True

    payload = {
        "jobId": "job-comp-1",
        "status": "completed",
        "durationMs": 1500.0,
        "inferenceDurationMs": 1200.0,
        "coldStartDurationMs": 300.0,
        "reportedCost": 0.00025,
    }

    with patch("requests.post", return_value=mock_resp) as mock_post:
        success = emit_complete_callback(
            callback_base_url="https://events.sightforge.dev",
            secret="test-secret",
            payload=payload,
        )
        assert success is True
        mock_post.assert_called_once()
        url = mock_post.call_args[0][0]
        assert url == "https://events.sightforge.dev/callbacks/complete"


def test_upload_result_to_storage_success() -> None:
    """Verifies result document PUT to presigned destination (R38)."""
    mock_resp = MagicMock()
    mock_resp.ok = True
    result_json = '{"jobId": "job-put-1", "frames": []}'

    with patch("requests.put", return_value=mock_resp) as mock_put:
        upload_result_to_storage(
            result_json=result_json,
            presigned_put_url="https://r2.sightforge.dev/result.json?signed=true",
        )
        mock_put.assert_called_once()
        headers = mock_put.call_args[1]["headers"]
        assert headers["Content-Type"] == "application/json"


def test_upload_result_to_storage_refusal() -> None:
    """Verifies that storage upload refusal raises ValueError (R38)."""
    mock_resp = MagicMock()
    mock_resp.ok = False
    mock_resp.status_code = 403
    mock_resp.text = "Forbidden"

    with (
        patch("requests.put", return_value=mock_resp),
        pytest.raises(ValueError, match="Storage upload refused"),
    ):
        upload_result_to_storage(
            result_json="{}",
            presigned_put_url="https://r2.sightforge.dev/result.json",
        )


def test_upload_artifact_to_storage_success() -> None:
    """Verifies dense artifact PUT upload (R55)."""
    mock_resp = MagicMock()
    mock_resp.ok = True

    with patch("requests.put", return_value=mock_resp) as mock_put:
        upload_artifact_to_storage(
            artifact_bytes=b"\x89PNG\r\n\x1a\nfake",
            presigned_put_url="https://r2.sightforge.dev/dense.png?signed=true",
        )
        mock_put.assert_called_once()
        headers = mock_put.call_args[1]["headers"]
        assert headers["Content-Type"] == "image/png"


def test_calculate_job_cost() -> None:
    """Verifies serverless execution cost estimation."""
    cost = calculate_job_cost(
        duration_ms=5000.0,
        inference_duration_ms=4000.0,
        cold_start_duration_ms=500.0,
        gpu_accelerator="T4",
    )
    assert cost > 0.0
    assert isinstance(cost, float)


def test_execute_job_orchestration_success() -> None:
    """Verifies end-to-end job orchestration happy path (R38, R47)."""
    payload = {
        "jobId": "job-orch-1",
        "userId": "user-1",
        "task": "detection",
        "mode": "per-frame",
        "mediaType": "image",
        "modelVariant": "nano",
        "resultPutUrl": "https://r2.sightforge.dev/res.json",
        "callbackBaseUrl": "https://events.sightforge.dev",
    }

    mock_doc = MagicMock()
    mock_doc.model_dump_json.return_value = '{"jobId": "job-orch-1"}'
    mock_summary = MagicMock()
    mock_summary.inference_duration_ms = 100.0
    mock_summary.cold_start_duration_ms = 50.0
    mock_doc.root.summary = mock_summary

    mock_manifest = MagicMock()
    mock_manifest.frame_count = 1
    mock_manifest.sampled_fps = 1.0
    mock_manifest.source_fps = 1.0

    mock_probe = MagicMock()

    with (
        patch("sightforge_inference.endpoint.probe_media", return_value=mock_probe),
        patch("sightforge_inference.endpoint.extract_frames", return_value=mock_manifest),
        patch("sightforge_inference.endpoint.upload_result_to_storage") as mock_upload,
        patch("sightforge_inference.endpoint.emit_progress_callback") as mock_prog,
        patch("sightforge_inference.endpoint.emit_complete_callback") as mock_comp,
        patch("sightforge_inference.endpoint.InferenceRunner._get_user_cls") as mock_cls,
    ):
        mock_runner = MagicMock()
        mock_runner.infer_frames.return_value = mock_doc
        mock_cls.return_value = MagicMock(return_value=mock_runner)

        res = execute_job_orchestration(payload)
        assert res["status"] == "completed"
        assert res["jobId"] == "job-orch-1"
        mock_upload.assert_called_once()
        assert mock_prog.call_count >= 1
        mock_comp.assert_called_once()


def test_execute_job_orchestration_failure_callback() -> None:
    """Verifies failure path reports signed complete callback with errorCode (R47)."""
    payload = {
        "jobId": "job-orch-fail",
        "userId": "user-1",
        "task": "detection",
        "callbackBaseUrl": "https://events.sightforge.dev",
    }

    with (
        patch(
            "sightforge_inference.endpoint.probe_media",
            side_effect=ValueError("Unsupported video codec 'vp9'"),
        ),
        patch("sightforge_inference.endpoint.emit_complete_callback") as mock_comp,
    ):
        res = execute_job_orchestration(payload)
        assert res["status"] == "failed"
        assert res["errorCode"] == "format"
        mock_comp.assert_called_once()
        payload_sent = mock_comp.call_args[1]["payload"]
        assert payload_sent["status"] == "failed"
        assert payload_sent["errorCode"] == "format"


def test_trigger_inference_endpoint() -> None:
    """Verifies web trigger endpoint returns 202 with callId (R83, KTD11)."""
    payload = {"jobId": "job-trigger-1"}

    mock_handle = MagicMock()
    mock_handle.object_id = "modal-call-12345"

    with patch("sightforge_inference.endpoint.execute_job_task.spawn", return_value=mock_handle):
        resp = trigger_inference.local(payload)
        assert resp["status"] == "accepted"
        assert resp["callId"] == "modal-call-12345"
