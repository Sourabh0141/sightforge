"""Tests for Permissive Alternative Depth Adapter (P3 U7, R117, KTD5)."""

import numpy as np
from sightforge_inference.adapter import InferenceConfig, ModelAdapter
from sightforge_inference.contracts.result import SightForgeResultDocument7, Unit
from sightforge_inference.tasks.depth import DepthAdapter
from sightforge_inference.tasks.depth_alternative import (
    PermissiveDepthAdapter,
    normalize_relative_inverse_depth,
)


def test_permissive_depth_adapter_implements_protocol() -> None:
    """Verifies that PermissiveDepthAdapter strictly satisfies ModelAdapter protocol (R117)."""
    adapter = PermissiveDepthAdapter(variant="nano")
    assert isinstance(adapter, ModelAdapter)


def test_normalize_relative_inverse_depth_inversion_math() -> None:
    """Verifies that relative disparity is accurately inverted onto metric meters (KTD5)."""
    # High disparity = close object (0.5m)
    # Low disparity = far object (8.0m)
    raw_disparity = np.array(
        [
            [10.0, 5.0],
            [0.0, 10.0],
        ],
        dtype=np.float32,
    )

    metric_depth = normalize_relative_inverse_depth(
        disparity=raw_disparity,
        min_depth_meters=0.5,
        max_depth_meters=8.0,
    )

    assert metric_depth.shape == (2, 2)
    # Highest disparity (10.0) -> closest (0.5m)
    assert np.isclose(metric_depth[0, 0], 0.5)
    assert np.isclose(metric_depth[1, 1], 0.5)
    # Lowest disparity (0.0) -> farthest (8.0m)
    assert np.isclose(metric_depth[1, 0], 8.0)
    # Mid disparity (5.0) -> midpoint (4.25m)
    assert np.isclose(metric_depth[0, 1], 4.25)


def test_both_depth_adapters_emit_identical_contract_shape() -> None:
    """Verifies both Depth adapters emit valid result documents (R117)."""
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    config = InferenceConfig(
        job_id="test-job-depth-swap",
        task="depth",
        mode="per-frame",
        variant="nano",
        media_type="image",
        device="cpu",
    )

    default_adapter = DepthAdapter(variant="nano")
    permissive_adapter = PermissiveDepthAdapter(variant="nano")

    doc_default = default_adapter.infer([frame], config)
    doc_permissive = permissive_adapter.infer([frame], config)

    # Both documents wrap SightForgeResultDocument7
    assert isinstance(doc_default.root, SightForgeResultDocument7)
    assert isinstance(doc_permissive.root, SightForgeResultDocument7)

    # Compare metadata fields
    assert doc_default.root.task == "depth"
    assert doc_permissive.root.task == "depth"
    assert doc_default.root.model_variant == doc_permissive.root.model_variant
    assert doc_default.root.artifact.depth_metadata.unit == Unit.meters
    assert doc_permissive.root.artifact.depth_metadata.unit == Unit.meters
    assert (
        doc_default.root.artifact.depth_metadata.scale_factor
        == doc_permissive.root.artifact.depth_metadata.scale_factor
        == 1000.0
    )
    assert (
        doc_default.root.artifact.depth_metadata.min_depth_meters
        == doc_permissive.root.artifact.depth_metadata.min_depth_meters
        == 0.5
    )
    assert (
        doc_default.root.artifact.depth_metadata.max_depth_meters
        == doc_permissive.root.artifact.depth_metadata.max_depth_meters
        == 8.0
    )
