"""SightForge Inference Service - Object Detection Task Adapter.

Implements bounding-box object detection emitting canonical DetectionFrame and
DetectionInstance records conforming to the Plan 1 contract schema (R34, R45).
"""

import time
from typing import Any

import numpy as np

from ..adapter import InferenceConfig
from ..config import ModelVariant
from ..contracts.result import (
    BoundingBox,
    DetectionFrame,
    DetectionInstance,
    MediaType,
    Mode,
    SchemaVersion,
    SightForgeResultDocument,
    SightForgeResultDocument1,
)
from .base import BaseYOLOAdapter


class DetectionAdapter(BaseYOLOAdapter):
    """Adapter for YOLO26 Object Detection."""

    def __init__(self, variant: ModelVariant = "nano", model: Any | None = None) -> None:
        super().__init__(task="detection", variant=variant, model=model)

    def infer(
        self,
        frames: list[np.ndarray[Any, Any]],
        config: InferenceConfig,
    ) -> SightForgeResultDocument:
        start_time = time.perf_counter()
        detection_frames: list[DetectionFrame] = []

        inference_start = time.perf_counter()
        for idx, frame in enumerate(frames):
            timestamp_ms = round((idx / (config.sampled_fps or 30.0)) * 1000.0, 2)
            instances: list[DetectionInstance] = []

            if self.model is not None:
                results = self.model.predict(
                    source=frame,
                    conf=config.confidence_threshold,
                    iou=config.iou_threshold,
                    device=config.device if config.device != "cuda" else 0,
                    verbose=False,
                )
                if results and len(results) > 0:
                    res = results[0]
                    boxes = res.boxes
                    if boxes is not None and len(boxes) > 0:
                        h, w = frame.shape[:2]
                        for box in boxes:
                            # Extract xyxy and convert to normalized [x_min, y_min, width, height]
                            xyxy = box.xyxy[0].cpu().numpy()
                            x_min = float(max(xyxy[0] / w, 0.0))
                            y_min = float(max(xyxy[1] / h, 0.0))
                            box_w = float(min((xyxy[2] - xyxy[0]) / w, 1.0 - x_min))
                            box_h = float(min((xyxy[3] - xyxy[1]) / h, 1.0 - y_min))

                            cls_id = int(box.cls[0].item())
                            conf = float(box.conf[0].item())
                            cls_name = res.names.get(cls_id, f"class_{cls_id}")

                            instances.append(
                                DetectionInstance(
                                    box=BoundingBox([x_min, y_min, box_w, box_h]),
                                    class_id=cls_id,
                                    class_name=cls_name,
                                    confidence=round(conf, 4),
                                )
                            )

            detection_frames.append(
                DetectionFrame(
                    frame_index=idx,
                    timestamp_ms=timestamp_ms,
                    instances=instances,
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

        doc = SightForgeResultDocument1(
            schema_version=SchemaVersion.field_1_0_0,
            job_id=config.job_id,
            task="detection",
            model_variant=config.variant,
            mode=Mode(config.mode),
            media_type=MediaType(config.media_type),
            summary=summary,
            frames=detection_frames,
        )
        return SightForgeResultDocument(doc)
