"""SightForge Inference Service - Base Task Adapter.

Provides the common base class for YOLO26 vision task adapters, managing checkpoint
loading, hardware device placement, execution timing, and metadata generation (R34, R45, KTD2).
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import numpy as np
from ultralytics import YOLO  # type: ignore[attr-defined]

from ..adapter import InferenceConfig, ModelAdapter
from ..config import ModelVariant, VisionTask
from ..contracts.result import ProcessingSummary, SightForgeResultDocument


class BaseYOLOAdapter(ModelAdapter, ABC):
    """Abstract base class for Ultralytics YOLO26 task adapters."""

    def __init__(self, task: VisionTask, variant: ModelVariant, model: Any | None = None) -> None:
        self._task = task
        self._variant = variant
        self._model = model

    @property
    def task(self) -> VisionTask:
        return self._task

    @property
    def variant(self) -> ModelVariant:
        return self._variant

    @property
    def model(self) -> Any:
        return self._model

    def load_model(self, weights_path: Path) -> None:
        """Loads YOLO model checkpoint from local verified path."""
        if not weights_path.exists():
            raise FileNotFoundError(f"Weight file not found at: {weights_path}")
        self._model = YOLO(str(weights_path))

    def _create_summary(
        self,
        start_time: float,
        inference_start: float,
        inference_end: float,
        end_time: float,
        frames_count: int,
        config: InferenceConfig,
    ) -> ProcessingSummary:
        """Constructs canonical ProcessingSummary metadata (R45)."""
        duration_ms = max((end_time - start_time) * 1000.0, 0.0)
        inference_duration_ms = max((inference_end - inference_start) * 1000.0, 0.0)
        source_fps = config.source_fps or 30.0
        sampled_fps = config.sampled_fps or (30.0 if config.media_type == "video" else 1.0)

        return ProcessingSummary(
            source_fps=source_fps,
            sampled_fps=sampled_fps,
            frames_processed=max(frames_count, 1),
            duration_ms=round(duration_ms, 2),
            inference_duration_ms=round(inference_duration_ms, 2),
            cold_start_duration_ms=0.0,
        )

    @abstractmethod
    def infer(
        self,
        frames: list[np.ndarray[Any, Any]],
        config: InferenceConfig,
    ) -> SightForgeResultDocument:
        """Executes task-specific inference and emits a valid SightForgeResultDocument."""
        ...
