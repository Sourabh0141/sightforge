"""SightForge Inference Service - Instance Segmentation Task Adapter.

Implements instance segmentation emitting bounding boxes and polygon contours (R34, R45).
"""

import time
from typing import Any

import numpy as np

from ..adapter import InferenceConfig
from ..config import ModelVariant
from ..contracts.result import (
    BoundingBox,
    CoordinatePoint,
    InstanceSegmentationFrame,
    InstanceSegmentationInstance,
    MediaType,
    Mode,
    SchemaVersion,
    SightForgeResultDocument,
    SightForgeResultDocument2,
)
from .base import BaseYOLOAdapter


class InstanceSegmentationAdapter(BaseYOLOAdapter):
    """Adapter for YOLO26 Instance Segmentation."""

    def __init__(self, variant: ModelVariant = "nano", model: Any | None = None) -> None:
        super().__init__(task="instance_segmentation", variant=variant, model=model)

    def infer(
        self,
        frames: list[np.ndarray[Any, Any]],
        config: InferenceConfig,
    ) -> SightForgeResultDocument:
        start_time = time.perf_counter()
        seg_frames: list[InstanceSegmentationFrame] = []

        inference_start = time.perf_counter()
        for idx, frame in enumerate(frames):
            timestamp_ms = round((idx / (config.sampled_fps or 30.0)) * 1000.0, 2)
            instances: list[InstanceSegmentationInstance] = []

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
                    masks = res.masks
                    if boxes is not None and masks is not None and len(boxes) > 0:
                        h, w = frame.shape[:2]
                        for i, box in enumerate(boxes):
                            xyxy = box.xyxy[0].cpu().numpy()
                            x_min = float(max(xyxy[0] / w, 0.0))
                            y_min = float(max(xyxy[1] / h, 0.0))
                            box_w = float(min((xyxy[2] - xyxy[0]) / w, 1.0 - x_min))
                            box_h = float(min((xyxy[3] - xyxy[1]) / h, 1.0 - y_min))

                            cls_id = int(box.cls[0].item())
                            conf = float(box.conf[0].item())
                            cls_name = res.names.get(cls_id, f"class_{cls_id}")

                            # Extract polygon points normalized to [0, 1]
                            poly_points = masks.xy[i] if i < len(masks.xy) else []
                            polygon_coords: list[CoordinatePoint] = []
                            for pt in poly_points:
                                px = float(max(min(pt[0] / w, 1.0), 0.0))
                                py = float(max(min(pt[1] / h, 1.0), 0.0))
                                polygon_coords.append(CoordinatePoint([round(px, 4), round(py, 4)]))

                            if len(polygon_coords) < 3:
                                # Ensure at least a triangle from box if contour is degenerate
                                polygon_coords = [
                                    CoordinatePoint([x_min, y_min]),
                                    CoordinatePoint([x_min + box_w, y_min]),
                                    CoordinatePoint([x_min + box_w, y_min + box_h]),
                                ]

                            instances.append(
                                InstanceSegmentationInstance(
                                    box=BoundingBox([x_min, y_min, box_w, box_h]),
                                    polygon=polygon_coords,
                                    class_id=cls_id,
                                    class_name=cls_name,
                                    confidence=round(conf, 4),
                                )
                            )

            seg_frames.append(
                InstanceSegmentationFrame(
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

        doc = SightForgeResultDocument2(
            schema_version=SchemaVersion.field_1_0_0,
            job_id=config.job_id,
            task="instance-segmentation",
            model_variant=config.variant,
            mode=Mode(config.mode),
            media_type=MediaType(config.media_type),
            summary=summary,
            frames=seg_frames,
        )
        return SightForgeResultDocument(doc)
