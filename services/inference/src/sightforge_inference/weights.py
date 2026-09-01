"""SightForge Inference Service - Model Weights Verification & Management.

Implements strict SHA-256 integrity verification for checkpoint loading and Volume
population to prevent untrusted code execution from altered weights (R39).
"""

import hashlib
from pathlib import Path

from .config import (
    WEIGHT_REGISTRY,
    WEIGHTS_MOUNT_PATH,
    ModelVariant,
    VisionTask,
    WeightMetadata,
)


def compute_file_sha256(file_path: Path) -> str:
    """Computes the SHA-256 hex digest of a local file in 64KB chunks."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(65536), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def verify_weight_checksum(file_path: Path, expected_sha256: str) -> bool:
    """Verifies that a weight checkpoint exists and matches its pinned SHA-256 digest."""
    if not file_path.is_file():
        return False
    actual_sha256 = compute_file_sha256(file_path)
    return actual_sha256.lower() == expected_sha256.lower()


def get_weight_metadata(task: VisionTask, variant: ModelVariant) -> WeightMetadata | None:
    """Retrieves pinned weight metadata for a given task and variant."""
    return WEIGHT_REGISTRY.get((task, variant))


def get_weight_path(
    task: VisionTask,
    variant: ModelVariant,
    base_dir: Path | str = WEIGHTS_MOUNT_PATH,
) -> Path:
    """Returns the expected filesystem path for a task-variant weight file."""
    metadata = get_weight_metadata(task, variant)
    if not metadata:
        raise ValueError(
            f"Unsupported task and variant combination: task='{task}', variant='{variant}'"
        )
    return Path(base_dir) / metadata.filename


def verify_all_weights(base_dir: Path | str = WEIGHTS_MOUNT_PATH) -> dict[str, bool]:
    """Verifies the presence and integrity of all registered weights in a directory."""
    results: dict[str, bool] = {}
    for (task, variant), meta in WEIGHT_REGISTRY.items():
        weight_file = Path(base_dir) / meta.filename
        key = f"{task}:{variant}:{meta.filename}"
        results[key] = verify_weight_checksum(weight_file, meta.sha256)
    return results
