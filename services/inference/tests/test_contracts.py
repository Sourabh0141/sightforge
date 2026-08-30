"""Test suite asserting Pydantic v2 contract models validate JSON Schema fixtures."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from sightforge_inference.contracts import (
    SightForgeResultDocument,
)

FIXTURES_DIR = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "packages"
    / "contracts"
    / "schemas"
    / "fixtures"
)


@pytest.mark.parametrize(
    "fixture_name",
    [
        "detection.json",
        "instance_segmentation.json",
        "pose.json",
        "obb.json",
        "classification.json",
        "semantic_segmentation.json",
        "depth.json",
        "tracking_detection.json",
    ],
)
def test_pydantic_validates_positive_fixtures(fixture_name: str) -> None:
    fixture_path = FIXTURES_DIR / fixture_name
    assert fixture_path.exists(), f"Fixture file {fixture_path} not found"

    with open(fixture_path, encoding="utf-8") as f:
        data = json.load(f)

    # Validate using Pydantic RootModel
    model = SightForgeResultDocument.model_validate(data)
    assert model.root.schema_version == "1.0.0"
    assert model.root.job_id.startswith("job_")
    assert model.root.task == data["task"]

    # Verify lossless round-trip serialization
    dumped = model.model_dump(mode="json", exclude_none=True)
    reloaded = SightForgeResultDocument.model_validate(dumped)
    assert reloaded.root.job_id == model.root.job_id
    assert reloaded.root.task == model.root.task


def test_pydantic_rejects_missing_schema_version() -> None:
    fixture_path = FIXTURES_DIR / "detection.json"
    with open(fixture_path, encoding="utf-8") as f:
        data = json.load(f)

    del data["schema_version"]
    with pytest.raises(ValidationError):
        SightForgeResultDocument.model_validate(data)


def test_pydantic_rejects_missing_task() -> None:
    fixture_path = FIXTURES_DIR / "detection.json"
    with open(fixture_path, encoding="utf-8") as f:
        data = json.load(f)

    del data["task"]
    with pytest.raises(ValidationError):
        SightForgeResultDocument.model_validate(data)


def test_pydantic_rejects_depth_inline_pixels() -> None:
    invalid_data = {
        "schema_version": "1.0.0",
        "job_id": "job_inv_depth",
        "task": "depth",
        "model_variant": "yolo26n",
        "mode": "per-frame",
        "media_type": "image",
        "summary": {
            "source_fps": 0.0,
            "sampled_fps": 0.0,
            "frames_processed": 1,
            "duration_ms": 0.0,
            "inference_duration_ms": 10.0,
            "cold_start_duration_ms": 0.0,
        },
        "pixels": [[0.5, 1.2]],
    }
    with pytest.raises(ValidationError):
        SightForgeResultDocument.model_validate(invalid_data)
