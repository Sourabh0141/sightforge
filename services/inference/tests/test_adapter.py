"""Tests for Model Adapter Boundary Protocol and Reversal Surface (P3 U2, R40, KTD5)."""

import inspect
from pathlib import Path
from typing import Any

import numpy as np
from sightforge_inference.adapter import (
    REVERSAL_SURFACE_REGISTRY,
    InferenceConfig,
    ModelAdapter,
    ReversalSurface,
)
from sightforge_inference.config import ModelVariant, VisionTask
from sightforge_inference.contracts.result import (
    ClassificationFrame,
    ClassificationPrediction,
    MediaType,
    ProcessingSummary,
    SchemaVersion,
    SightForgeResultDocument,
    SightForgeResultDocument5,
)


class ConformingMockClassificationAdapter:
    """Mock adapter that conforms to ModelAdapter Protocol."""

    @property
    def task(self) -> VisionTask:
        return "classification"

    @property
    def variant(self) -> ModelVariant:
        return "nano"

    def load_model(self, weights_path: Path) -> None:
        pass

    def infer(
        self,
        frames: list[np.ndarray[Any, Any]],
        config: InferenceConfig,
    ) -> SightForgeResultDocument:
        summary = ProcessingSummary(
            source_fps=config.source_fps or 30.0,
            sampled_fps=config.sampled_fps or 30.0,
            frames_processed=len(frames),
            duration_ms=50.0,
            inference_duration_ms=45.0,
            cold_start_duration_ms=0.0,
        )
        doc5 = SightForgeResultDocument5(
            schema_version=SchemaVersion.field_1_0_0,
            job_id=config.job_id,
            task="classification",
            model_variant=config.variant,
            mode="per-frame",
            media_type=MediaType.image,
            summary=summary,
            frames=[
                ClassificationFrame(
                    frame_index=0,
                    timestamp_ms=0.0,
                    predictions=[
                        ClassificationPrediction(
                            class_id=0,
                            class_name="tabby_cat",
                            confidence=0.95,
                            rank=1,
                        )
                    ],
                )
            ],
        )
        return SightForgeResultDocument(doc5)


class NonConformingAdapterMissingInfer:
    """Mock adapter missing infer() method."""

    @property
    def task(self) -> VisionTask:
        return "classification"

    @property
    def variant(self) -> ModelVariant:
        return "nano"

    def load_model(self, weights_path: Path) -> None:
        pass


def test_protocol_runtime_check() -> None:
    """Verifies that conforming implementations satisfy ModelAdapter and others fail."""
    conforming = ConformingMockClassificationAdapter()
    assert isinstance(conforming, ModelAdapter)

    non_conforming = NonConformingAdapterMissingInfer()
    assert not isinstance(non_conforming, ModelAdapter)


def test_zero_library_type_leakage() -> None:
    """Verifies that no third-party library types appear in adapter signatures (KTD5)."""
    import ast

    import sightforge_inference.adapter as adapter_module

    # 1. AST check: ensure adapter.py never imports torch, ultralytics, or cv2
    source_code = inspect.getsource(adapter_module)
    tree = ast.parse(source_code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                assert alias.name not in ["torch", "ultralytics", "cv2"]
        elif isinstance(node, ast.ImportFrom):
            assert node.module not in ["torch", "ultralytics", "cv2"]

    # 2. Inspect ModelAdapter protocol method signatures
    for method_name in ["load_model", "infer"]:
        method = getattr(ModelAdapter, method_name)
        sig = inspect.signature(method)
        for param in sig.parameters.values():
            param_str = str(param.annotation).lower()
            assert "torch" not in param_str
            assert "ultralytics" not in param_str
            assert "cv2" not in param_str
        return_str = str(sig.return_annotation).lower()
        assert "torch" not in return_str
        assert "ultralytics" not in return_str
        assert "cv2" not in return_str


def test_reversal_surface_registry_completeness() -> None:
    """Verifies the full 5-element reversal matrix is documented for all 7 tasks (R40)."""
    all_tasks: list[VisionTask] = [
        "detection",
        "instance_segmentation",
        "semantic_segmentation",
        "classification",
        "pose",
        "obb",
        "depth",
    ]

    for task in all_tasks:
        assert task in REVERSAL_SURFACE_REGISTRY
        rev = REVERSAL_SURFACE_REGISTRY[task]
        assert isinstance(rev, ReversalSurface)
        assert len(rev.permissive_replacement) > 0
        assert len(rev.class_vocabulary) > 0
        assert len(rev.schema_version_impact) > 0

        # Tracking-eligible vs per-frame-only
        if task in ["detection", "instance_segmentation", "pose", "obb"]:
            assert rev.tracker_substitution is not None
            assert len(rev.tracker_substitution) > 0
        else:
            assert rev.tracker_substitution is None

        # Pose skeleton topology
        if task == "pose":
            assert rev.skeleton_topology is not None
            assert "17 keypoints" in rev.skeleton_topology
        else:
            assert rev.skeleton_topology is None


def test_adapter_emits_valid_contract_document() -> None:
    """Verifies that an adapter execution produces a valid SightForgeResultDocument."""
    adapter = ConformingMockClassificationAdapter()
    config = InferenceConfig(
        job_id="job-uuid-1234",
        task="classification",
        mode="per-frame",
        variant="nano",
        media_type="image",
        confidence_threshold=0.5,
    )
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    doc = adapter.infer([dummy_frame], config)
    assert isinstance(doc, SightForgeResultDocument)
    root = doc.root
    assert root.job_id == "job-uuid-1234"
    assert root.task == "classification"
    assert root.model_variant == "nano"
    assert root.summary.frames_processed == 1
