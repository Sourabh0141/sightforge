"""Tests for the Seven Computer Vision Task Implementations (P3 U3, R34, R45)."""

from unittest.mock import MagicMock

import numpy as np
import pytest
import torch
from sightforge_inference.adapter import InferenceConfig
from sightforge_inference.config import VisionTask
from sightforge_inference.contracts.result import (
    DepthResult,
    DetectionResult,
    InstanceSegmentationResult,
    ObbResult,
    PoseResult,
    SemanticSegmentationResult,
    SightForgeResultDocument,
)
from sightforge_inference.tasks import (
    BaseYOLOAdapter,
    ClassificationAdapter,
    DepthAdapter,
    DetectionAdapter,
    InstanceSegmentationAdapter,
    ObbAdapter,
    PoseAdapter,
    SemanticSegmentationAdapter,
    get_task_adapter,
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


def test_get_task_adapter_factory() -> None:
    """Verifies that the factory returns the correct adapter class for all 7 tasks."""
    for task in ALL_TASKS:
        adapter = get_task_adapter(task, variant="nano")
        assert isinstance(adapter, BaseYOLOAdapter)
        assert adapter.task == task
        assert adapter.variant == "nano"

    with pytest.raises(ValueError, match="Unknown vision task"):
        get_task_adapter("unknown_task")  # type: ignore[arg-type]


def test_detection_adapter_execution() -> None:
    """Verifies DetectionAdapter execution and contract output."""
    mock_model = MagicMock()
    mock_box = MagicMock()
    mock_box.xyxy = [torch.tensor([10.0, 20.0, 110.0, 220.0])]
    mock_box.cls = [torch.tensor(0)]
    mock_box.conf = [torch.tensor(0.95)]

    mock_res = MagicMock()
    mock_res.boxes = [mock_box]
    mock_res.names = {0: "person"}
    mock_model.predict.return_value = [mock_res]

    adapter = DetectionAdapter(variant="nano", model=mock_model)
    config = InferenceConfig(
        job_id="job-det-1",
        task="detection",
        mode="per-frame",
        variant="nano",
        media_type="image",
        confidence_threshold=0.5,
    )
    frame = np.zeros((480, 640, 3), dtype=np.uint8)

    doc = adapter.infer([frame], config)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert isinstance(root, DetectionResult)
    assert root.task == "detection"
    assert root.frames is not None
    assert len(root.frames) == 1
    assert len(root.frames[0].instances) == 1
    inst = root.frames[0].instances[0]
    assert inst.class_name == "person"
    assert inst.confidence == 0.95


def test_instance_segmentation_adapter_execution() -> None:
    """Verifies InstanceSegmentationAdapter execution and polygon generation."""
    mock_model = MagicMock()
    mock_box = MagicMock()
    mock_box.xyxy = [torch.tensor([10.0, 10.0, 50.0, 50.0])]
    mock_box.cls = [torch.tensor(2)]
    mock_box.conf = [torch.tensor(0.88)]

    mock_masks = MagicMock()
    mock_masks.xy = [np.array([[10, 10], [50, 10], [50, 50], [10, 50]])]

    mock_res = MagicMock()
    mock_res.boxes = [mock_box]
    mock_res.masks = mock_masks
    mock_res.names = {2: "car"}
    mock_model.predict.return_value = [mock_res]

    adapter = InstanceSegmentationAdapter(variant="nano", model=mock_model)
    config = InferenceConfig(
        job_id="job-seg-1",
        task="instance_segmentation",
        mode="per-frame",
        variant="nano",
        media_type="image",
    )
    frame = np.zeros((480, 640, 3), dtype=np.uint8)

    doc = adapter.infer([frame], config)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert isinstance(root, InstanceSegmentationResult)
    assert root.task == "instance-segmentation"
    assert root.frames is not None
    assert len(root.frames[0].instances) == 1
    inst = root.frames[0].instances[0]
    assert inst.class_name == "car"
    assert len(inst.polygon) >= 3


def test_classification_adapter_execution() -> None:
    """Verifies ClassificationAdapter execution and ranked prediction list."""
    mock_model = MagicMock()
    mock_probs = MagicMock()
    mock_probs.top5 = [123, 456]
    mock_probs.data = {
        123: torch.tensor(0.82),
        456: torch.tensor(0.12),
    }
    mock_res = MagicMock()
    mock_res.probs = mock_probs
    mock_res.names = {123: "tiger_cat", 456: "tabby"}
    mock_model.predict.return_value = [mock_res]

    adapter = ClassificationAdapter(variant="nano", model=mock_model)
    config = InferenceConfig(
        job_id="job-cls-1",
        task="classification",
        mode="per-frame",
        variant="nano",
        media_type="image",
    )
    frame = np.zeros((224, 224, 3), dtype=np.uint8)

    doc = adapter.infer([frame], config)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert root.task == "classification"
    assert len(root.frames) == 1
    preds = root.frames[0].predictions
    assert len(preds) == 2
    assert preds[0].class_name == "tiger_cat"
    assert preds[0].rank == 1


def test_pose_adapter_execution() -> None:
    """Verifies PoseAdapter execution and 17 COCO keypoints extraction."""
    mock_model = MagicMock()
    mock_box = MagicMock()
    mock_box.xyxy = [torch.tensor([50.0, 50.0, 200.0, 400.0])]
    mock_box.cls = [torch.tensor(0)]
    mock_box.conf = [torch.tensor(0.91)]

    mock_kpts = MagicMock()
    kpts_arr = np.zeros((1, 17, 2))
    kpts_arr[0, 0] = [100.0, 60.0]  # nose
    mock_kpts.xy = torch.tensor(kpts_arr)
    mock_kpts.conf = torch.tensor(np.ones((1, 17)) * 0.9)

    mock_res = MagicMock()
    mock_res.boxes = [mock_box]
    mock_res.keypoints = mock_kpts
    mock_res.names = {0: "person"}
    mock_model.predict.return_value = [mock_res]

    adapter = PoseAdapter(variant="nano", model=mock_model)
    config = InferenceConfig(
        job_id="job-pose-1",
        task="pose",
        mode="per-frame",
        variant="nano",
        media_type="image",
    )
    frame = np.zeros((480, 640, 3), dtype=np.uint8)

    doc = adapter.infer([frame], config)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert isinstance(root, PoseResult)
    assert root.task == "pose"
    assert root.frames is not None
    inst = root.frames[0].instances[0]
    assert len(inst.keypoints) == 17
    assert inst.keypoints[0].name == "nose"
    assert inst.keypoints[0].visible is True


def test_obb_adapter_execution() -> None:
    """Verifies ObbAdapter execution and RotatedBoundingBox extraction."""
    mock_model = MagicMock()
    mock_obb = MagicMock()
    mock_obb.__len__.return_value = 1
    # cx, cy, w, h, angle_rad
    mock_obb.xywhr = torch.tensor([[200.0, 150.0, 80.0, 40.0, 0.785]])
    mock_obb.cls = torch.tensor([5])
    mock_obb.conf = torch.tensor([0.87])

    mock_res = MagicMock()
    mock_res.obb = mock_obb
    mock_res.names = {5: "plane"}
    mock_model.predict.return_value = [mock_res]

    adapter = ObbAdapter(variant="nano", model=mock_model)
    config = InferenceConfig(
        job_id="job-obb-1",
        task="obb",
        mode="per-frame",
        variant="nano",
        media_type="image",
    )
    frame = np.zeros((480, 640, 3), dtype=np.uint8)

    doc = adapter.infer([frame], config)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert isinstance(root, ObbResult)
    assert root.task == "obb"
    assert root.frames is not None
    inst = root.frames[0].instances[0]
    assert inst.class_name == "plane"
    assert len(inst.rbox.root) == 5
    assert inst.rbox.root[4] == 44.98  # degrees


def test_semantic_segmentation_adapter_dense_artifact() -> None:
    """Verifies SemanticSegmentationAdapter dense artifact emission and color palette."""
    adapter = SemanticSegmentationAdapter(variant="nano", model=None)
    config = InferenceConfig(
        job_id="job-sem-1",
        task="semantic_segmentation",
        mode="per-frame",
        variant="nano",
        media_type="image",
    )
    frame = np.zeros((480, 640, 3), dtype=np.uint8)

    doc = adapter.infer([frame], config)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert isinstance(root, SemanticSegmentationResult)
    assert root.task == "semantic-segmentation"
    assert root.artifact.encoding == "image/png"
    assert root.artifact.key.startswith("results/job-sem-1/")
    assert len(root.artifact.color_palette) >= 1


def test_depth_adapter_dense_artifact() -> None:
    """Verifies DepthAdapter dense artifact emission and metric metadata."""
    adapter = DepthAdapter(variant="nano", model=None)
    config = InferenceConfig(
        job_id="job-depth-1",
        task="depth",
        mode="per-frame",
        variant="nano",
        media_type="image",
    )
    frame = np.zeros((480, 640, 3), dtype=np.uint8)

    doc = adapter.infer([frame], config)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert isinstance(root, DepthResult)
    assert root.task == "depth"
    assert root.artifact.encoding == "image/png"
    assert root.artifact.depth_metadata.unit == "meters"
    assert (
        root.artifact.depth_metadata.min_depth_meters
        < root.artifact.depth_metadata.max_depth_meters
    )
