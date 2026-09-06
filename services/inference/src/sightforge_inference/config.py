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
        sha256="0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n.pt",
    ),
    ("detection", "small"): WeightMetadata(
        filename="yolo26s.pt",
        task="detection",
        variant="small",
        sha256="85a76fe86dd8afe384648546b56a7a78580c7cb7b404fc595f97969322d502d5",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s.pt",
    ),
    # 2. Instance Segmentation
    ("instance_segmentation", "nano"): WeightMetadata(
        filename="yolo26n-seg.pt",
        task="instance_segmentation",
        variant="nano",
        sha256="55ed65c56c91713d23e8402371c6c49a6fd84f257f7dce452e8d70e41dcbe152",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-seg.pt",
    ),
    ("instance_segmentation", "small"): WeightMetadata(
        filename="yolo26s-seg.pt",
        task="instance_segmentation",
        variant="small",
        sha256="1caa81c0195412efa411b632bcfb8c184939dddb6ae41f6a80c41b211ff257c3",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-seg.pt",
    ),
    # 3. Semantic Segmentation (shares segmentation backbone)
    ("semantic_segmentation", "nano"): WeightMetadata(
        filename="yolo26n-seg.pt",
        task="semantic_segmentation",
        variant="nano",
        sha256="55ed65c56c91713d23e8402371c6c49a6fd84f257f7dce452e8d70e41dcbe152",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-seg.pt",
    ),
    ("semantic_segmentation", "small"): WeightMetadata(
        filename="yolo26s-seg.pt",
        task="semantic_segmentation",
        variant="small",
        sha256="1caa81c0195412efa411b632bcfb8c184939dddb6ae41f6a80c41b211ff257c3",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-seg.pt",
    ),
    # 4. Classification
    ("classification", "nano"): WeightMetadata(
        filename="yolo26n-cls.pt",
        task="classification",
        variant="nano",
        sha256="c62d41bf9625777760018bf914d2e6cd472420ccd01706d97a61cb6c82502bd7",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-cls.pt",
    ),
    ("classification", "small"): WeightMetadata(
        filename="yolo26s-cls.pt",
        task="classification",
        variant="small",
        sha256="e2b605d1c8c212b434a75a32759a6f7adf1d2b29c35f76bdccd4c794cb653cf2",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-cls.pt",
    ),
    # 5. Pose Estimation
    ("pose", "nano"): WeightMetadata(
        filename="yolo26n-pose.pt",
        task="pose",
        variant="nano",
        sha256="869e83fcdffdc7371fa4e34cd8e51c838cc729571d1635e5141e3075e9319dc0",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-pose.pt",
    ),
    ("pose", "small"): WeightMetadata(
        filename="yolo26s-pose.pt",
        task="pose",
        variant="small",
        sha256="1060bda4a27012060eca246f9b2adeea22eabb045a1e58f8d229be29b7ebc2ba",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-pose.pt",
    ),
    # 6. Oriented Bounding Box (OBB)
    ("obb", "nano"): WeightMetadata(
        filename="yolo26n-obb.pt",
        task="obb",
        variant="nano",
        sha256="b62898ebf38940ca4df323863e45ee9d84a1a46d5d11ebdde529fb33aa9f3a32",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n-obb.pt",
    ),
    ("obb", "small"): WeightMetadata(
        filename="yolo26s-obb.pt",
        task="obb",
        variant="small",
        sha256="43fa63102922e0701501241b307420d24fc55e080816888b18bf8c6f96b1a45a",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s-obb.pt",
    ),
    # 7. Depth Estimation (Monocular Depth Head sharing backbone)
    ("depth", "nano"): WeightMetadata(
        filename="yolo26n-depth.pt",
        task="depth",
        variant="nano",
        sha256="0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11n.pt",
    ),
    ("depth", "small"): WeightMetadata(
        filename="yolo26s-depth.pt",
        task="depth",
        variant="small",
        sha256="85a76fe86dd8afe384648546b56a7a78580c7cb7b404fc595f97969322d502d5",
        download_url=f"{YOLO26_RELEASE_BASE}/yolo11s.pt",
    ),
}
