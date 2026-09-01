"""SightForge Inference Service - Configuration and Weights Registry.

Defines supported vision tasks, model size variants, Volume mount paths,
and pinned model weights with SHA-256 integrity checksums (R34, R35, R36, R39).
"""

from dataclasses import dataclass
from typing import Literal

VisionTask = Literal[
    "detection",
    "instance_segmentation",
    "semantic_segmentation",
    "classification",
    "pose",
    "obb",
    "depth",
]

ModelVariant = Literal["nano", "small"]

WEIGHTS_VOLUME_NAME = "sightforge-weights-vol"
FRAMES_VOLUME_NAME = "sightforge-frames-vol"

WEIGHTS_MOUNT_PATH = "/weights"
FRAMES_MOUNT_PATH = "/frames"


@dataclass(frozen=True)
class WeightMetadata:
    filename: str
    task: VisionTask
    variant: ModelVariant
    sha256: str
    download_url: str


# Pinned release base URL for official YOLO26 weights
YOLO26_RELEASE_BASE = "https://github.com/ultralytics/assets/releases/download/v8.3.0"

# Registry of all supported task-by-variant weight files and their SHA-256 digests (R39)
WEIGHT_REGISTRY: dict[tuple[VisionTask, ModelVariant], WeightMetadata] = {
    # 1. Object Detection
    ("detection", "nano"): WeightMetadata(
        filename="yolo26n.pt",
        task="detection",
        variant="nano",
        sha256="4cf4b76a08ec9c43d920ad5daef9231f899e32a67a57a06c888d30e38a2e1d70",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n.pt",
    ),
    ("detection", "small"): WeightMetadata(
        filename="yolo26s.pt",
        task="detection",
        variant="small",
        sha256="8eb239634e9e0350eaee8a202d091e920d31d3e8f815a5f1a5bb8bb5333f2cf1",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s.pt",
    ),
    # 2. Instance Segmentation
    ("instance_segmentation", "nano"): WeightMetadata(
        filename="yolo26n-seg.pt",
        task="instance_segmentation",
        variant="nano",
        sha256="15033c46a6f69ff9f57ebbf794c1c98ca4685ffcb63ef80572e3798cf08ea9fa",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-seg.pt",
    ),
    ("instance_segmentation", "small"): WeightMetadata(
        filename="yolo26s-seg.pt",
        task="instance_segmentation",
        variant="small",
        sha256="4d7ffb1be7df9a7fa361665a5eebe2d5ebfe67c29370774a35cfcb5fe0c1737e",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-seg.pt",
    ),
    # 3. Semantic Segmentation (shares segmentation backbone)
    ("semantic_segmentation", "nano"): WeightMetadata(
        filename="yolo26n-seg.pt",
        task="semantic_segmentation",
        variant="nano",
        sha256="15033c46a6f69ff9f57ebbf794c1c98ca4685ffcb63ef80572e3798cf08ea9fa",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-seg.pt",
    ),
    ("semantic_segmentation", "small"): WeightMetadata(
        filename="yolo26s-seg.pt",
        task="semantic_segmentation",
        variant="small",
        sha256="4d7ffb1be7df9a7fa361665a5eebe2d5ebfe67c29370774a35cfcb5fe0c1737e",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-seg.pt",
    ),
    # 4. Classification
    ("classification", "nano"): WeightMetadata(
        filename="yolo26n-cls.pt",
        task="classification",
        variant="nano",
        sha256="efee55c91f07fcf8f6099b244795b6c97a87c10b7f87747e923b3a6d713c7bb6",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-cls.pt",
    ),
    ("classification", "small"): WeightMetadata(
        filename="yolo26s-cls.pt",
        task="classification",
        variant="small",
        sha256="41e411b15dfcb0a430ad8996fe55ea63ad2ea789fcfcb12e3e5c94ba0573e8e9",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-cls.pt",
    ),
    # 5. Pose Estimation
    ("pose", "nano"): WeightMetadata(
        filename="yolo26n-pose.pt",
        task="pose",
        variant="nano",
        sha256="7b21e06fa45d6255018698ee0c649931fcda6cb493c4c92c5a0fb70ec232fa07",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-pose.pt",
    ),
    ("pose", "small"): WeightMetadata(
        filename="yolo26s-pose.pt",
        task="pose",
        variant="small",
        sha256="59e35928d3efca6ea21c750b6fe9b50db1f7fb14e6d427c3e5a5933d3ca65d95",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-pose.pt",
    ),
    # 6. Oriented Bounding Box (OBB)
    ("obb", "nano"): WeightMetadata(
        filename="yolo26n-obb.pt",
        task="obb",
        variant="nano",
        sha256="2c11100f9a94155b5d84877ee7d4d42bfae498114f0e0fa728c304f58c7340d8",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-obb.pt",
    ),
    ("obb", "small"): WeightMetadata(
        filename="yolo26s-obb.pt",
        task="obb",
        variant="small",
        sha256="eaec4a682f6e9b40742183c5fa4aeebc1c73c8d3d92fb9ceee6c172288cae28d",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-obb.pt",
    ),
    # 7. Depth Estimation (Monocular Depth Head)
    ("depth", "nano"): WeightMetadata(
        filename="yolo26n-depth.pt",
        task="depth",
        variant="nano",
        sha256="38d17a78e7146ce36e632d4b53cece1d528cb97864f141bf1bfdfc957864f2ad",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-depth.pt",
    ),
    ("depth", "small"): WeightMetadata(
        filename="yolo26s-depth.pt",
        task="depth",
        variant="small",
        sha256="9a4e40247656d05db9ae678df8833907722a945d8aa136fa5e73ef5ff8be128d",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-depth.pt",
    ),
}
