"""SightForge Inference Service - Classification Task Adapter.

Implements whole-image classification emitting ranked label predictions (R34, R45).
"""

import time
from typing import Any

import numpy as np

from ..adapter import InferenceConfig
from ..config import ModelVariant
from ..contracts.result import (
    ClassificationFrame,
    ClassificationPrediction,
    MediaType,
    SchemaVersion,
    SightForgeResultDocument,
    SightForgeResultDocument5,
)
from .base import BaseYOLOAdapter


class ClassificationAdapter(BaseYOLOAdapter):
    """Adapter for YOLO26 Image Classification."""

    def __init__(self, variant: ModelVariant = "nano", model: Any | None = None) -> None:
        super().__init__(task="classification", variant=variant, model=model)

    def infer(
        self,
        frames: list[np.ndarray[Any, Any]],
        config: InferenceConfig,
    ) -> SightForgeResultDocument:
        start_time = time.perf_counter()
        cls_frames: list[ClassificationFrame] = []

        inference_start = time.perf_counter()
        for idx, frame in enumerate(frames):
            timestamp_ms = round((idx / (config.sampled_fps or 30.0)) * 1000.0, 2)
            predictions: list[ClassificationPrediction] = []

            if self.model is not None:
                results = self.model.predict(
                    source=frame,
                    device=config.device if config.device != "cuda" else 0,
                    verbose=False,
                )
                if results and len(results) > 0:
                    res = results[0]
                    probs = res.probs
                    if probs is not None:
                        top5_indices = probs.top5
                        for rank, cls_id in enumerate(top5_indices, start=1):
                            conf = float(probs.data[cls_id].item())
                            cls_name = res.names.get(cls_id, f"class_{cls_id}")
                            predictions.append(
                                ClassificationPrediction(
                                    class_id=cls_id,
                                    class_name=cls_name,
                                    confidence=round(conf, 4),
                                    rank=rank,
                                )
                            )

            if not predictions:
                predictions.append(
                    ClassificationPrediction(
                        class_id=0,
                        class_name="unknown",
                        confidence=1.0,
                        rank=1,
                    )
                )

            cls_frames.append(
                ClassificationFrame(
                    frame_index=idx,
                    timestamp_ms=timestamp_ms,
                    predictions=predictions,
                )
            )
        inference_end = time.perf_counter()

        end_time = time.perf_counter()
        summary = self._create_summary(
            start_time=start_time,
            inference_start=inference_start,
            inference_end=inference_end,
            end_time=end_time,
            frames_count=len(frames),
            config=config,
        )

        doc = SightForgeResultDocument5(
            schema_version=SchemaVersion.field_1_0_0,
            job_id=config.job_id,
            task="classification",
            model_variant=config.variant,
            mode="per-frame",
            media_type=MediaType(config.media_type),
            summary=summary,
            frames=cls_frames,
        )
        return SightForgeResultDocument(doc)
