from collections.abc import Callable
from typing import Any

from ..config import ModelVariant, VisionTask
from .base import BaseYOLOAdapter
from .classification import ClassificationAdapter
from .depth import DepthAdapter
from .depth_alternative import (
    PermissiveDepthAdapter,
    normalize_relative_inverse_depth,
)
from .detection import DetectionAdapter
from .instance_segmentation import InstanceSegmentationAdapter
from .obb import ObbAdapter
from .pose import PoseAdapter
from .semantic_segmentation import SemanticSegmentationAdapter

TASK_ADAPTER_MAP: dict[VisionTask, Callable[..., BaseYOLOAdapter]] = {
    "detection": DetectionAdapter,
    "instance_segmentation": InstanceSegmentationAdapter,
    "classification": ClassificationAdapter,
    "pose": PoseAdapter,
    "obb": ObbAdapter,
    "semantic_segmentation": SemanticSegmentationAdapter,
    "depth": DepthAdapter,
}


def get_task_adapter(
    task: VisionTask,
    variant: ModelVariant = "nano",
    model: Any | None = None,
) -> BaseYOLOAdapter:
    """Factory function instantiating the appropriate task adapter (R34)."""
    adapter_cls = TASK_ADAPTER_MAP.get(task)
    if not adapter_cls:
        raise ValueError(f"Unknown vision task: '{task}'")
    return adapter_cls(variant=variant, model=model)


__all__ = [
    "BaseYOLOAdapter",
    "DetectionAdapter",
    "InstanceSegmentationAdapter",
    "ClassificationAdapter",
    "PoseAdapter",
    "ObbAdapter",
    "SemanticSegmentationAdapter",
    "DepthAdapter",
    "PermissiveDepthAdapter",
    "normalize_relative_inverse_depth",
    "get_task_adapter",
    "TASK_ADAPTER_MAP",
]
