"""Tests for Inference Service Benchmark Suite and Cost Accounting (P3 U7, R48, R114)."""

import json
import tempfile
from pathlib import Path

from sightforge_inference.benchmarks.benchmark_suite import (
    build_benchmark_report,
    calculate_cost_per_seconds,
    write_benchmark_report_file,
)


def test_calculate_cost_per_seconds() -> None:
    """Verifies serverless compute cost calculation."""
    # 3600 seconds on $0.59/hr T4 = $0.59
    cost_1hr = calculate_cost_per_seconds(3600.0, 0.59)
    assert cost_1hr == 0.59

    # 10 seconds on $0.80/hr L4
    cost_10s = calculate_cost_per_seconds(10.0, 0.80)
    assert 0.0022 <= cost_10s <= 0.0023


def test_build_benchmark_report_completeness() -> None:
    """Verifies that the benchmark report covers all 7 tasks and 4 variants (R114)."""
    report = build_benchmark_report()

    assert report["service"] == "sightforge-inference"
    assert "baselineGpuTier" in report
    assert "candidateGpuTiers" in report
    assert "storageAtRest" in report
    assert "taskMetrics" in report
    assert "trackingRateTradeoffs" in report

    # 7 tasks * 2 variants = 14 task metrics
    metrics = report["taskMetrics"]
    assert len(metrics) == 14

    tasks_covered = {m["task"] for m in metrics}
    expected_tasks = {
        "detection",
        "instance_segmentation",
        "classification",
        "pose",
        "obb",
        "semantic_segmentation",
        "depth",
    }
    assert tasks_covered == expected_tasks

    variants_covered = {m["variant"] for m in metrics}
    assert variants_covered == {"nano", "small"}

    # Verify storage at rest
    storage = report["storageAtRest"]
    assert storage["monthlyContinuousStorageCostUsd"] == 3.75
    assert storage["scaleToZeroComputeIdleCostUsd"] == 0.0

    # Verify cold start budget
    assert report["coldStartBudgetDeclarationMs"] == 3500.0


def test_write_benchmark_report_file() -> None:
    """Verifies writing benchmark JSON report to disk."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir) / "test_report.json"
        res_path = write_benchmark_report_file(tmp_path)
        assert res_path.exists()

        content = json.loads(res_path.read_text(encoding="utf-8"))
        assert content["service"] == "sightforge-inference"
        assert len(content["taskMetrics"]) == 14
