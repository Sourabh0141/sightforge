"""SightForge Inference Service Package."""

from .app import (
    app,
    cpu_image,
    frames_volume,
    gpu_image,
    inference_secrets,
    weights_volume,
)
from .config import (
    FRAMES_MOUNT_PATH,
    FRAMES_VOLUME_NAME,
    WEIGHT_REGISTRY,
    WEIGHTS_MOUNT_PATH,
    WEIGHTS_VOLUME_NAME,
    ModelVariant,
    VisionTask,
)
from .weights import (
    compute_file_sha256,
    get_weight_path,
    verify_weight_checksum,
)

__version__ = "0.1.0"

__all__ = [
    "app",
    "cpu_image",
    "gpu_image",
    "weights_volume",
    "frames_volume",
    "inference_secrets",
    "WEIGHT_REGISTRY",
    "WEIGHTS_VOLUME_NAME",
    "FRAMES_VOLUME_NAME",
    "WEIGHTS_MOUNT_PATH",
    "FRAMES_MOUNT_PATH",
    "VisionTask",
    "ModelVariant",
    "compute_file_sha256",
    "verify_weight_checksum",
    "get_weight_path",
]
