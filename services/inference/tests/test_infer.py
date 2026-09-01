"""Tests for GPU Inference Runner and Video Pipelines (P3 U5, R38, R41, R42, R44, R48)."""

from pathlib import Path
from typing import Any, cast
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
import torch
from sightforge_inference.adapter import InferenceConfig
from sightforge_inference.config import FRAMES_MOUNT_PATH, VisionTask
from sightforge_inference.contracts.result import (
    DetectionTrack,
    InstanceSegmentationTrack,
    Mode,
    ObbTrack,
    PoseTrack,
    SightForgeResultDocument,
    SightForgeResultDocument1,
    SightForgeResultDocument2,
    SightForgeResultDocument3,
    SightForgeResultDocument4,
)
from sightforge_inference.infer import (
    InferenceRunner,
    build_tracker_config,
    run_tracking_pipeline,
)
from sightforge_inference.media import FrameEntry, FrameManifest
from sightforge_inference.tasks import (
    DetectionAdapter,
    InstanceSegmentationAdapter,
    ObbAdapter,
    PoseAdapter,
)


def test_build_tracker_config_rate_scaling(tmp_path: Path) -> None:
    """Verifies that tracker buffer scales proportionally with FPS and disables ReID (KTD6, R44)."""
    cfg_low = build_tracker_config(
        job_id="job-low-fps", fps=2.0, tolerance_seconds=1.0, dest_dir=tmp_path
    )
    content_low = cfg_low.read_text(encoding="utf-8")
    assert "track_buffer: 2" in content_low
    assert "with_reid: False" in content_low

    cfg_high = build_tracker_config(
        job_id="job-high-fps", fps=30.0, tolerance_seconds=1.0, dest_dir=tmp_path
    )
    content_high = cfg_high.read_text(encoding="utf-8")
    assert "track_buffer: 30" in content_high
    assert "with_reid: False" in content_high


@pytest.mark.parametrize("ineligible_task", ["depth", "classification", "semantic_segmentation"])
def test_tracking_refused_on_ineligible_tasks(ineligible_task: VisionTask) -> None:
    """Verifies that tracking mode is authoritatively refused on ineligible tasks (R42, R43)."""
    mock_adapter = MagicMock()
    config = InferenceConfig(
        job_id="job-bad-track",
        task=ineligible_task,
        mode="tracking",
        variant="nano",
        media_type="video",
    )
    frames = [np.zeros((100, 100, 3), dtype=np.uint8)]

    with pytest.raises(ValueError, match="Tracking mode is not supported for task"):
        run_tracking_pipeline(mock_adapter, frames, config, effective_fps=30.0)


def test_run_tracking_pipeline_detection() -> None:
    """Verifies detection video tracking pipeline produces track-keyed document."""
    mock_model = MagicMock()
    mock_box = MagicMock()
    mock_box.xyxy = [torch.tensor([10.0, 20.0, 110.0, 220.0])]
    mock_box.cls = [torch.tensor(0)]
    mock_box.conf = [torch.tensor(0.92)]

    mock_boxes = MagicMock()
    mock_boxes.__len__.return_value = 1
    mock_boxes.__iter__.return_value = [mock_box]
    mock_boxes.id = torch.tensor([42])

    mock_res = MagicMock()
    mock_res.boxes = mock_boxes
    mock_res.obb = None
    mock_res.names = {0: "person"}
    mock_model.track.return_value = [mock_res]

    adapter = DetectionAdapter(variant="nano", model=mock_model)
    config = InferenceConfig(
        job_id="job-track-det",
        task="detection",
        mode="tracking",
        variant="nano",
        media_type="video",
    )
    frames = [np.zeros((480, 640, 3), dtype=np.uint8), np.zeros((480, 640, 3), dtype=np.uint8)]

    doc = run_tracking_pipeline(adapter, frames, config, effective_fps=30.0)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert isinstance(root, SightForgeResultDocument1)
    assert root.mode == Mode.tracking
    assert root.tracks is not None
    assert len(root.tracks) == 1
    track = root.tracks[0]
    assert isinstance(track, DetectionTrack)
    assert track.track_id == 42
    assert track.class_name == "person"
    assert track.confidence_avg == 0.92
    assert len(track.observations) == 2


def test_run_tracking_pipeline_instance_segmentation() -> None:
    """Verifies instance segmentation video tracking pipeline."""
    mock_model = MagicMock()
    mock_box = MagicMock()
    mock_box.xyxy = [torch.tensor([10.0, 10.0, 50.0, 50.0])]
    mock_box.cls = [torch.tensor(2)]
    mock_box.conf = [torch.tensor(0.85)]

    mock_boxes = MagicMock()
    mock_boxes.__len__.return_value = 1
    mock_boxes.__iter__.return_value = [mock_box]
    mock_boxes.id = torch.tensor([101])

    mock_masks = MagicMock()
    mock_masks.xy = [np.array([[10, 10], [50, 10], [50, 50]])]

    mock_res = MagicMock()
    mock_res.boxes = mock_boxes
    mock_res.masks = mock_masks
    mock_res.obb = None
    mock_res.names = {2: "car"}
    mock_model.track.return_value = [mock_res]

    adapter = InstanceSegmentationAdapter(variant="nano", model=mock_model)
    config = InferenceConfig(
        job_id="job-track-seg",
        task="instance_segmentation",
        mode="tracking",
        variant="nano",
        media_type="video",
    )
    frames = [np.zeros((480, 640, 3), dtype=np.uint8)]

    doc = run_tracking_pipeline(adapter, frames, config, effective_fps=15.0)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert isinstance(root, SightForgeResultDocument2)
    assert root.mode == Mode.tracking
    assert root.tracks is not None
    assert len(root.tracks) == 1
    track = root.tracks[0]
    assert isinstance(track, InstanceSegmentationTrack)
    assert track.track_id == 101
    assert len(track.observations[0].polygon) == 3


def test_run_tracking_pipeline_pose() -> None:
    """Verifies pose tracking pipeline."""
    mock_model = MagicMock()
    mock_box = MagicMock()
    mock_box.xyxy = [torch.tensor([20.0, 20.0, 100.0, 300.0])]
    mock_box.cls = [torch.tensor(0)]
    mock_box.conf = [torch.tensor(0.95)]

    mock_boxes = MagicMock()
    mock_boxes.__len__.return_value = 1
    mock_boxes.__iter__.return_value = [mock_box]
    mock_boxes.id = torch.tensor([7])

    mock_kpts = MagicMock()
    mock_kpts.xy = torch.zeros((1, 17, 2))
    mock_kpts.conf = torch.ones((1, 17))

    mock_res = MagicMock()
    mock_res.boxes = mock_boxes
    mock_res.keypoints = mock_kpts
    mock_res.obb = None
    mock_res.names = {0: "person"}
    mock_model.track.return_value = [mock_res]

    adapter = PoseAdapter(variant="nano", model=mock_model)
    config = InferenceConfig(
        job_id="job-track-pose",
        task="pose",
        mode="tracking",
        variant="nano",
        media_type="video",
    )
    frames = [np.zeros((480, 640, 3), dtype=np.uint8)]

    doc = run_tracking_pipeline(adapter, frames, config, effective_fps=30.0)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert isinstance(root, SightForgeResultDocument3)
    assert root.mode == Mode.tracking
    assert root.tracks is not None
    assert len(root.tracks) == 1
    track = root.tracks[0]
    assert isinstance(track, PoseTrack)
    assert track.track_id == 7
    assert len(track.observations[0].keypoints) == 17


def test_run_tracking_pipeline_obb() -> None:
    """Verifies OBB tracking pipeline."""
    mock_model = MagicMock()
    mock_obb = MagicMock()
    mock_obb.__len__.return_value = 1
    mock_obb.id = torch.tensor([88])
    mock_obb.xywhr = torch.tensor([[150.0, 150.0, 60.0, 30.0, 0.5]])
    mock_obb.cls = torch.tensor([1])
    mock_obb.conf = torch.tensor([0.90])

    mock_res = MagicMock()
    mock_res.boxes = None
    mock_res.obb = mock_obb
    mock_res.names = {1: "ship"}
    mock_model.track.return_value = [mock_res]

    adapter = ObbAdapter(variant="nano", model=mock_model)
    config = InferenceConfig(
        job_id="job-track-obb",
        task="obb",
        mode="tracking",
        variant="nano",
        media_type="video",
    )
    frames = [np.zeros((480, 640, 3), dtype=np.uint8)]

    doc = run_tracking_pipeline(adapter, frames, config, effective_fps=10.0)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert isinstance(root, SightForgeResultDocument4)
    assert root.mode == Mode.tracking
    assert root.tracks is not None
    assert len(root.tracks) == 1
    track = root.tracks[0]
    assert isinstance(track, ObbTrack)
    assert track.track_id == 88


def test_inference_runner_enter_and_cold_start() -> None:
    """Verifies InferenceRunner enter hook and cold-start measurement logic (R45)."""
    runner_cls = cast(Any, InferenceRunner)._get_user_cls()
    runner = runner_cls()
    runner.task = "detection"
    runner.variant = "nano"

    with (
        patch("sightforge_inference.infer.get_weight_path") as mock_weight_path,
        patch("sightforge_inference.infer.verify_weight_checksum") as mock_verify,
        patch("sightforge_inference.infer.get_task_adapter") as mock_get_adapter,
        patch("sightforge_inference.infer.get_weight_metadata") as mock_meta,
    ):
        mock_path = MagicMock()
        mock_path.exists.return_value = True
        mock_weight_path.return_value = mock_path
        mock_metadata = MagicMock()
        mock_metadata.sha256 = "abc123"
        mock_meta.return_value = mock_metadata
        mock_adapter = MagicMock()
        mock_get_adapter.return_value = mock_adapter

        runner.enter()
        mock_verify.assert_called_once_with(mock_path, "abc123")
        mock_adapter.load_model.assert_called_once_with(mock_path)

        # First infer_frames call reports cold start duration
        config = InferenceConfig(
            job_id="job-cold-1",
            task="detection",
            mode="per-frame",
            variant="nano",
            media_type="image",
        )
        manifest = FrameManifest(
            job_id="job-cold-1",
            media_type="image",
            frame_count=1,
            source_fps=1.0,
            sampled_fps=1.0,
            duration_s=0.0,
            frames=[
                FrameEntry(
                    frame_index=0,
                    timestamp_ms=0.0,
                    file_path="nonexistent.png",
                    width=640,
                    height=480,
                )
            ],
        )

        mock_doc = MagicMock()
        mock_summary = MagicMock()
        mock_doc.root.summary = mock_summary
        mock_adapter.infer.return_value = mock_doc

        with patch("sightforge_inference.infer.cleanup_job_frames") as mock_cleanup:
            res1 = runner.infer_frames(config, manifest)
            assert res1 == mock_doc
            mock_cleanup.assert_called_once()
            # Check that cold start was recorded
            assert mock_summary.cold_start_duration_ms >= 0.0

            # Second call reports 0.0ms
            runner.infer_frames(config, manifest)
            assert mock_summary.cold_start_duration_ms == 0.0


def test_inference_runner_cleanup_in_finally_on_error() -> None:
    """Verifies that cleanup_job_frames is invoked in finally even on inference error (KTD4)."""
    runner_cls = cast(Any, InferenceRunner)._get_user_cls()
    runner = runner_cls()
    runner.task = "detection"
    runner.variant = "nano"

    mock_adapter = MagicMock()
    mock_adapter.infer.side_effect = RuntimeError("Inference engine crashed")

    config = InferenceConfig(
        job_id="job-fail-cleanup",
        task="detection",
        mode="per-frame",
        variant="nano",
        media_type="image",
    )
    manifest = FrameManifest(
        job_id="job-fail-cleanup",
        media_type="image",
        frame_count=1,
        source_fps=1.0,
        sampled_fps=1.0,
        duration_s=0.0,
        frames=[],
    )

    with (
        patch("sightforge_inference.infer.get_task_adapter", return_value=mock_adapter),
        patch("sightforge_inference.infer.cleanup_job_frames") as mock_cleanup,
        pytest.raises(RuntimeError, match="Inference engine crashed"),
    ):
        runner.infer_frames(config, manifest)

    mock_cleanup.assert_called_once_with("job-fail-cleanup", Path(FRAMES_MOUNT_PATH))
