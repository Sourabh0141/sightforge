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
