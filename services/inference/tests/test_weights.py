"""Tests for Weights Registry and Checksum Verification (P3 U1, R39)."""

import hashlib
from pathlib import Path

import pytest
from sightforge_inference.config import (
    WEIGHTS_MOUNT_PATH,
    ModelVariant,
    VisionTask,
)
from sightforge_inference.weights import (
    compute_file_sha256,
    get_weight_metadata,
    get_weight_path,
    verify_weight_checksum,
)

ALL_TASKS: list[VisionTask] = [
    "detection",
    "instance_segmentation",
    "semantic_segmentation",
    "classification",
    "pose",
    "obb",
    "depth",
]

ALL_VARIANTS: list[ModelVariant] = ["nano", "small"]


def test_registry_contains_all_tasks_and_variants() -> None:
    """Verifies that every task-variant combination has registered weight metadata."""
    for task in ALL_TASKS:
        for variant in ALL_VARIANTS:
            meta = get_weight_metadata(task, variant)
            assert meta is not None, f"Missing weight metadata for ({task}, {variant})"
            assert meta.filename.endswith(".pt")
            assert len(meta.sha256) == 64
            assert meta.download_url.startswith("https://")


def test_get_weight_path() -> None:
    """Verifies weight path resolution."""
    path = get_weight_path("detection", "nano")
    assert path == Path(WEIGHTS_MOUNT_PATH) / "yolo26n.pt"

    with pytest.raises(ValueError, match="Unsupported task and variant"):
        get_weight_path("invalid_task", "nano")  # type: ignore[arg-type]


def test_checksum_verification(tmp_path: Path) -> None:
    """Verifies SHA-256 computation and integrity checks (R39)."""
    test_file = tmp_path / "model.pt"
    test_content = b"fake-pytorch-checkpoint-bytes-12345"
    test_file.write_bytes(test_content)

    expected_hash = hashlib.sha256(test_content).hexdigest()

    # 1. Matches expected checksum
    assert compute_file_sha256(test_file) == expected_hash
    assert verify_weight_checksum(test_file, expected_hash) is True

    # 2. Rejects mismatched or corrupted checksum
    corrupted_hash = "0" * 64
    assert verify_weight_checksum(test_file, corrupted_hash) is False

    # 3. Rejects non-existent file
    missing_file = tmp_path / "missing.pt"
    assert verify_weight_checksum(missing_file, expected_hash) is False


def test_ensure_weights_cached_existing(tmp_path: Path) -> None:
    """Verifies that ensure_weights_cached reuses existing verified file without download."""
    from sightforge_inference.weights import ensure_weights_cached

    meta = get_weight_metadata("detection", "nano")
    assert meta is not None

    weight_file = tmp_path / meta.filename
    # Write matching checksum content
    from unittest.mock import MagicMock, patch

    with patch("sightforge_inference.weights.verify_weight_checksum", return_value=True):
        weight_file.write_bytes(b"dummy_data")
        result = ensure_weights_cached("detection", "nano", base_dir=tmp_path)
        assert result == weight_file


def test_download_weight_checkpoint(tmp_path: Path) -> None:
    """Verifies download_weight_checkpoint downloads, computes sha256, and atomically saves."""
    from unittest.mock import MagicMock, patch
    from sightforge_inference.weights import download_weight_checkpoint

    meta = get_weight_metadata("detection", "nano")
    assert meta is not None

    dummy_content = b"valid_checkpoint_data"
    expected_hash = hashlib.sha256(dummy_content).hexdigest()

    mock_resp = MagicMock()
    mock_resp.iter_content.return_value = [dummy_content]
    mock_resp.raise_for_status.return_value = None

    with (
        patch("requests.get", return_value=mock_resp),
        patch("sightforge_inference.weights.get_weight_metadata") as mock_meta,
    ):
        mock_metadata = MagicMock()
        mock_metadata.filename = "yolo26n.pt"
        mock_metadata.sha256 = expected_hash
        mock_metadata.download_url = "https://example.com/yolo26n.pt"
        mock_meta.return_value = mock_metadata

        saved_path = download_weight_checkpoint("detection", "nano", base_dir=tmp_path)
        assert saved_path.exists()
        assert saved_path.read_bytes() == dummy_content

