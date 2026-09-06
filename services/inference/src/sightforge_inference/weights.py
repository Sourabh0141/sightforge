"""SightForge Inference Service - Model Weights Verification & Management.

Implements strict SHA-256 integrity verification for checkpoint loading and Volume
population to prevent untrusted code execution from altered weights (R39).
"""

import hashlib
import os
from pathlib import Path
from typing import Any

import requests

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


def download_weight_checkpoint(
    task: VisionTask,
    variant: ModelVariant,
    base_dir: Path | str = WEIGHTS_MOUNT_PATH,
    timeout: float = 120.0,
) -> Path:
    """Downloads model checkpoint from metadata URL, verifies SHA-256, and saves atomically (R39)."""
    metadata = get_weight_metadata(task, variant)
    if not metadata:
        raise ValueError(
            f"Unsupported task and variant combination: task='{task}', variant='{variant}'"
        )

    target_dir = Path(base_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / metadata.filename
    temp_path = target_dir / f"{metadata.filename}.tmp.{os.getpid()}"

    try:
        response = requests.get(
            metadata.download_url,
            headers={"User-Agent": "SightForge-Inference/1.0"},
            stream=True,
            timeout=timeout,
        )
        response.raise_for_status()

        sha256_hash = hashlib.sha256()
        with open(temp_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)
                    sha256_hash.update(chunk)

        computed_sha256 = sha256_hash.hexdigest()
        if computed_sha256.lower() != metadata.sha256.lower():
            raise ValueError(
                f"Checksum mismatch for downloaded weights '{metadata.filename}': "
                f"expected {metadata.sha256}, got {computed_sha256}"
            )

        # Atomic rename to final path
        temp_path.replace(target_path)
        return target_path
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


def ensure_weights_cached(
    task: VisionTask,
    variant: ModelVariant,
    base_dir: Path | str = WEIGHTS_MOUNT_PATH,
    volume: Any | None = None,
) -> Path:
    """Ensures model weight checkpoint is present and verified on disk/volume, downloading if missing (R39)."""
    metadata = get_weight_metadata(task, variant)
    if not metadata:
        raise ValueError(
            f"Unsupported task and variant combination: task='{task}', variant='{variant}'"
        )

    target_path = Path(base_dir) / metadata.filename
    if target_path.is_file() and verify_weight_checksum(target_path, metadata.sha256):
        return target_path

    # Missing or checksum failed: download and verify
    downloaded_path = download_weight_checkpoint(task, variant, base_dir=base_dir)

    # Persist to Modal volume if volume is provided
    if volume is not None and hasattr(volume, "commit"):
        try:
            volume.commit()
        except Exception:
            pass

    return downloaded_path


def seed_all_weights(
    base_dir: Path | str = WEIGHTS_MOUNT_PATH,
    volume: Any | None = None,
) -> dict[str, bool]:
    """Downloads, verifies, and seeds all registered model weights into the volume directory."""
    results: dict[str, bool] = {}
    for (task, variant), meta in WEIGHT_REGISTRY.items():
        key = f"{task}:{variant}:{meta.filename}"
        try:
            weight_path = ensure_weights_cached(task, variant, base_dir=base_dir)
            results[key] = verify_weight_checksum(weight_path, meta.sha256)
        except Exception as exc:
            results[key] = False

    if volume is not None and hasattr(volume, "commit"):
        try:
            volume.commit()
        except Exception:
            pass

    return results


def verify_all_weights(base_dir: Path | str = WEIGHTS_MOUNT_PATH) -> dict[str, bool]:
    """Verifies the presence and integrity of all registered weights in a directory."""
    results: dict[str, bool] = {}
    for (task, variant), meta in WEIGHT_REGISTRY.items():
        weight_file = Path(base_dir) / meta.filename
        key = f"{task}:{variant}:{meta.filename}"
        results[key] = verify_weight_checksum(weight_file, meta.sha256)
    return results

