"""Tests for Authoritative Media Ingestion and Frame Extraction (P3 U4, R22, R37)."""

import json
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image
from sightforge_inference.media import (
    FrameManifest,
    MediaProbeResult,
    cleanup_job_frames,
    extract_frames,
    fetch_media_conditional,
    probe_media,
)


def test_fetch_media_conditional_success(tmp_path: Path) -> None:
    """Verifies conditional media fetching with matching ETag."""
    dest_path = tmp_path / "downloaded.mp4"
    fake_bytes = b"sample_video_bytes"

    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.status_code = 200
    mock_response.headers = {"ETag": '"etag-12345"'}
    mock_response.iter_content.return_value = [fake_bytes]

    with patch("requests.get", return_value=mock_response) as mock_get:
        fetch_media_conditional(
            url="https://storage.sightforge.dev/media.mp4",
            expected_etag='"etag-12345"',
            dest_path=dest_path,
        )
        assert dest_path.exists()
        assert dest_path.read_bytes() == fake_bytes
        mock_get.assert_called_once()
        headers = mock_get.call_args[1]["headers"]
        assert headers.get("If-Match") == '"etag-12345"'


def test_fetch_media_conditional_precondition_failed(tmp_path: Path) -> None:
    """Verifies that 412 Precondition Failed raises ValueError immediately."""
    dest_path = tmp_path / "downloaded.mp4"

    mock_response = MagicMock()
    mock_response.ok = False
    mock_response.status_code = 412
    mock_response.text = "Precondition Failed"

    with (
        patch("requests.get", return_value=mock_response),
        pytest.raises(ValueError, match="Precondition failed"),
    ):
        fetch_media_conditional(
            url="https://storage.sightforge.dev/media.mp4",
            expected_etag="etag-old",
            dest_path=dest_path,
        )


def test_fetch_media_conditional_mismatched_header(tmp_path: Path) -> None:
    """Verifies that ETag header divergence raises ValueError."""
    dest_path = tmp_path / "downloaded.mp4"

    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.status_code = 200
    mock_response.headers = {"ETag": '"mutated-etag-999"'}
    mock_response.iter_content.return_value = [b"bytes"]

    with (
        patch("requests.get", return_value=mock_response),
        pytest.raises(ValueError, match="ETag mismatch"),
    ):
        fetch_media_conditional(
            url="https://storage.sightforge.dev/media.mp4",
            expected_etag='"original-etag-111"',
            dest_path=dest_path,
        )


def test_probe_media_video_valid(tmp_path: Path) -> None:
    """Verifies probing a valid H.264 video within duration limit (R22)."""
    fake_video = tmp_path / "video.mp4"
    fake_video.write_bytes(b"dummy")

    ffprobe_json = json.dumps(
        {
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1920,
                    "height": 1080,
                    "duration": "14.5",
                    "r_frame_rate": "30/1",
                }
            ],
            "format": {
                "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
                "duration": "14.5",
            },
        }
    )

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = ffprobe_json

    with patch("subprocess.run", return_value=mock_proc):
        probe = probe_media(fake_video)
        assert probe.media_type == "video"
        assert probe.codec_name == "h264"
        assert probe.duration_s == 14.5
        assert probe.width == 1920
        assert probe.height == 1080
        assert probe.source_fps == 30.0


def test_probe_media_video_duration_exceeded(tmp_path: Path) -> None:
    """Verifies that video duration > 30s is rejected authoritatively (R17, R22)."""
    fake_video = tmp_path / "long_video.mp4"
    fake_video.write_bytes(b"dummy")

    ffprobe_json = json.dumps(
        {
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1280,
                    "height": 720,
                    "duration": "35.2",
                    "r_frame_rate": "30/1",
                }
            ],
            "format": {
                "format_name": "mp4",
                "duration": "35.2",
            },
        }
    )

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = ffprobe_json

    with (
        patch("subprocess.run", return_value=mock_proc),
        pytest.raises(ValueError, match="Video duration .* exceeds maximum permitted ceiling"),
    ):
        probe_media(fake_video)


def test_probe_media_video_unsupported_codec(tmp_path: Path) -> None:
    """Verifies that non-H.264 video codec is rejected (R16, R22)."""
    fake_video = tmp_path / "hevc_video.mp4"
    fake_video.write_bytes(b"dummy")

    ffprobe_json = json.dumps(
        {
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "hevc",
                    "width": 1920,
                    "height": 1080,
                    "duration": "10.0",
                    "r_frame_rate": "30/1",
                }
            ],
            "format": {
                "format_name": "mp4",
                "duration": "10.0",
            },
        }
    )

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.stdout = ffprobe_json

    with (
        patch("subprocess.run", return_value=mock_proc),
        pytest.raises(ValueError, match="Unsupported video codec 'hevc'"),
    ):
        probe_media(fake_video)


def test_probe_media_timeout(tmp_path: Path) -> None:
    """Verifies that subprocess timeout raises TimeoutError (R17)."""
    fake_video = tmp_path / "hang.mp4"
    fake_video.write_bytes(b"dummy")

    with (
        patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="ffprobe", timeout=15.0)),
        pytest.raises(TimeoutError, match="ffprobe timed out"),
    ):
        probe_media(fake_video, timeout=15.0)


def test_extract_frames_image(tmp_path: Path) -> None:
    """Verifies still image extraction produces exactly one frame at timestamp 0 (KTD4)."""
    img_path = tmp_path / "test_image.png"
    img = Image.new("RGB", (320, 240), color=(255, 0, 0))
    img.save(img_path)

    probe = MediaProbeResult(
        media_type="image",
        format_name="png",
        codec_name="png",
        duration_s=0.0,
        width=320,
        height=240,
        source_fps=1.0,
        stream_count=1,
    )

    out_dir = tmp_path / "frames_job_1"
    manifest = extract_frames(
        job_id="job-img-1",
        media_path=img_path,
        output_dir=out_dir,
        probe=probe,
    )

    assert isinstance(manifest, FrameManifest)
    assert manifest.job_id == "job-img-1"
    assert manifest.frame_count == 1
    assert manifest.sampled_fps == 1.0
    assert len(manifest.frames) == 1
    assert manifest.frames[0].timestamp_ms == 0.0
    assert manifest.frames[0].width == 320
    assert manifest.frames[0].height == 240
    assert Path(manifest.frames[0].file_path).exists()


def test_extract_frames_video_per_frame_sampling(tmp_path: Path) -> None:
    """Verifies video per-frame sampling clamps rate between 2 and 10 fps (R41, KTD4)."""
    video_path = tmp_path / "sample.mp4"
    video_path.write_bytes(b"dummy")

    probe = MediaProbeResult(
        media_type="video",
        format_name="mp4",
        codec_name="h264",
        duration_s=5.0,
        width=1280,
        height=720,
        source_fps=30.0,
        stream_count=1,
    )

    out_dir = tmp_path / "frames_job_2"
    out_dir.mkdir(parents=True, exist_ok=True)
    # Simulate extracted frames
    for i in range(15):
        (out_dir / f"frame_{i + 1:05d}.png").write_bytes(b"frame")

    mock_proc = MagicMock()
    mock_proc.returncode = 0

    with patch("subprocess.run", return_value=mock_proc) as mock_ffmpeg:
        manifest = extract_frames(
            job_id="job-vid-2",
            media_path=video_path,
            output_dir=out_dir,
            probe=probe,
            sampled_fps=3.0,
            mode="per-frame",
        )

        assert manifest.frame_count == 15
        assert manifest.sampled_fps == 3.0
        assert manifest.source_fps == 30.0
        assert manifest.frames[0].timestamp_ms == 0.0
        assert manifest.frames[1].timestamp_ms == 333.33
        mock_ffmpeg.assert_called_once()
        cmd_args = mock_ffmpeg.call_args[0][0]
        assert "fps=3.0" in cmd_args


def test_cleanup_job_frames(tmp_path: Path) -> None:
    """Verifies that per-job frames directory is completely removed for volume hygiene (KTD4)."""
    frames_root = tmp_path / "frames_vol"
    job_dir = frames_root / "job-to-clean"
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "frame_00001.png").write_bytes(b"frame")
    assert job_dir.exists()

    cleanup_job_frames(job_id="job-to-clean", frames_dir=frames_root)
    assert not job_dir.exists()
