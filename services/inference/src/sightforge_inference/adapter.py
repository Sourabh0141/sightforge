"""SightForge Inference Service - Model Adapter Boundary & Reversal Surface.

Defines the decoupled model adapter protocol boundary that isolates underlying
YOLO26 / AGPL dependencies behind a strict task-shaped interface emitting canonical
contract models, and documents the complete 5-element reversal matrix per task (R40, KTD1, KTD5).
"""

from dataclasses import dataclass
from pathlib import Path
from typing import (
    Any,
    Literal,
    Protocol,
    runtime_checkable,
)

import numpy as np

from .config import ModelVariant, VisionTask
from .contracts.result import SightForgeResultDocument


@dataclass(frozen=True)
class InferenceConfig:
    """Inference execution configuration passed across the adapter boundary."""

    job_id: str
    task: VisionTask
    mode: Literal["per-frame", "tracking"]
    variant: ModelVariant
    media_type: Literal["image", "video"]
    confidence_threshold: float = 0.25
    iou_threshold: float = 0.45
    sampled_fps: float | None = None
    source_fps: float | None = None
    device: str = "cuda"


@dataclass(frozen=True)
class ReversalSurface:
    """Documents the 5-element reversal surface for replacing the AGPL dependency per task (R40)."""

    task: VisionTask
    permissive_replacement: str
    tracker_substitution: str | None
    class_vocabulary: str
    skeleton_topology: str | None
    schema_version_impact: str


# Full 7-Task Reversal Surface Matrix (R40)
REVERSAL_SURFACE_REGISTRY: dict[VisionTask, ReversalSurface] = {
    "detection": ReversalSurface(
        task="detection",
        permissive_replacement=(
            "RT-DETR (Apache-2.0, Baidu/PaddlePaddle) or YOLOv10 (AGPL-free fork)"
        ),
        tracker_substitution=(
            "ByteTrack (MIT License, ifrahit/ByteTrack) decoupled from Ultralytics"
        ),
        class_vocabulary="COCO 80-class standard taxonomy [person, bicycle, car, ...]",
        skeleton_topology=None,
        schema_version_impact="None (v1.0.0 contract schema remains 100% compatible)",
    ),
    "instance_segmentation": ReversalSurface(
        task="instance_segmentation",
        permissive_replacement=(
            "MobileSAM (Apache-2.0, ChaoningZhang/MobileSAM) or FastSAM (Apache-2.0)"
        ),
        tracker_substitution="ByteTrack with mask propagation (MIT License)",
        class_vocabulary="COCO 80-class polygon contour taxonomy",
        skeleton_topology=None,
        schema_version_impact="None (v1.0.0 polygon/RLE contract schema remains compatible)",
    ),
    "semantic_segmentation": ReversalSurface(
        task="semantic_segmentation",
        permissive_replacement="SegFormer (Apache-2.0, NVIDIA/HuggingFace)",
        tracker_substitution=None,  # Semantic segmentation is per-frame only (R43)
        class_vocabulary="ADE20K (150 classes) or Cityscapes (19 classes) taxonomy",
        skeleton_topology=None,
        schema_version_impact=(
            "Requires palette mapping update in result metadata if class count differs"
        ),
    ),
    "classification": ReversalSurface(
        task="classification",
        permissive_replacement="EfficientNet-V2 (Apache-2.0, Google) or ConvNeXt (MIT, Meta)",
        tracker_substitution=None,  # Classification is per-frame only (R43)
        class_vocabulary="ImageNet 1000-class standard taxonomy",
        skeleton_topology=None,
        schema_version_impact=(
            "None (v1.0.0 ranked classification prediction contract remains compatible)"
        ),
    ),
    "pose": ReversalSurface(
        task="pose",
        permissive_replacement="RTMPose (Apache-2.0, OpenMMLab) or ViTPose (Apache-2.0)",
        tracker_substitution="ByteTrack with keypoint similarity metric (MIT License)",
        class_vocabulary=(
            "COCO 17-keypoint standard topology [nose, eyes, ears, shoulders, "
            "elbows, wrists, hips, knees, ankles]"
        ),
        skeleton_topology=(
            "17 keypoints with 19 limb adjacency edges "
            "[[15,13],[13,11],[16,14],[14,12],[11,12],[5,11],[6,12],[5,6],[5,7],"
            "[6,8],[7,9],[8,10],[1,2],[0,1],[0,2],[1,3],[2,4],[3,5],[4,6]]"
        ),
        schema_version_impact="None (v1.0.0 17-point pose contract remains 100% compatible)",
    ),
    "obb": ReversalSurface(
        task="obb",
        permissive_replacement="Oriented R-CNN / RoI Transformer (Apache-2.0, MMRotate)",
        tracker_substitution="ByteTrack with oriented rotated IoU (MIT License)",
        class_vocabulary="DOTA 15-class standard aerial / oriented taxonomy",
        skeleton_topology=None,
        schema_version_impact=(
            "None (v1.0.0 5-parameter [cx, cy, w, h, angle] contract remains compatible)"
        ),
    ),
    "depth": ReversalSurface(
        task="depth",
        permissive_replacement="Depth Anything V2 (Apache-2.0, Depth-Anything / TikTok / HKUST)",
        tracker_substitution=None,  # Depth is per-frame only (R43)
        class_vocabulary="Continuous metric/relative depth in meters [0.0, max_depth]",
        skeleton_topology=None,
        schema_version_impact=(
            "None (v1.0.0 packed 16-bit depth artifact contract remains compatible)"
        ),
    ),
}


@runtime_checkable
class ModelAdapter(Protocol):
    """Protocol boundary isolating computer vision model engines from the inference pipeline.

    Guarantees that no third-party library types (e.g. torch.Tensor, ultralytics Results,
    cv2) cross the boundary.
    """

    @property
    def task(self) -> VisionTask:
        """The vision task supported by this adapter."""
        ...

    @property
    def variant(self) -> ModelVariant:
        """The model size variant (nano, small)."""
        ...

    def load_model(self, weights_path: Path) -> None:
        """Loads and initializes model weights from a verified local filesystem path.

        Args:
            weights_path: Path to the verified checkpoint file on the weights Volume.
        """
        ...

    def infer(
        self,
        frames: list[np.ndarray[Any, Any]],
        config: InferenceConfig,
    ) -> SightForgeResultDocument:
        """Executes inference over decoded video/image frames and emits a contract result document.

        Args:
            frames: Decoded RGB video or image frames as NumPy ndarrays.
            config: Inference execution parameters.

        Returns:
            SightForgeResultDocument conforming to the Plan 1 JSON Schema contract.
        """
        ...
