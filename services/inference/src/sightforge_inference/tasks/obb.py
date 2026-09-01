"""SightForge Inference Service - Oriented Bounding Box (OBB) Task Adapter.

Implements oriented object detection emitting 5-parameter RotatedBoundingBox (R34, R45).
"""

import time
from typing import Any

import numpy as np

from ..adapter import InferenceConfig
from ..config import ModelVariant
from ..contracts.result import (
    MediaType,
    Mode,
    ObbFrame,
    ObbInstance,
    RotatedBoundingBox,
    SchemaVersion,
    SightForgeResultDocument,
    SightForgeResultDocument4,
)
from .base import BaseYOLOAdapter


class ObbAdapter(BaseYOLOAdapter):
    """Adapter for YOLO26 Oriented Bounding Box (OBB) Detection."""

    def __init__(self, variant: ModelVariant = "nano", model: Any | None = None) -> None:
        super().__init__(task="obb", variant=variant, model=model)

    def infer(
        self,
        frames: list[np.ndarray[Any, Any]],
        config: InferenceConfig,
    ) -> SightForgeResultDocument:
        start_time = time.perf_counter()
        obb_frames: list[ObbFrame] = []

        inference_start = time.perf_counter()
        for idx, frame in enumerate(frames):
            timestamp_ms = round((idx / (config.sampled_fps or 30.0)) * 1000.0, 2)
            instances: list[ObbInstance] = []

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
                    obb_data = res.obb
                    if (
                        obb_data is not None
                        and hasattr(obb_data, "xywhr")
                        and len(obb_data.xywhr) > 0
                    ):
                        h, w = frame.shape[:2]
                        # xywhr contains [cx, cy, w, h, r]
                        xywhr = obb_data.xywhr.cpu().numpy()
                        cls_ids = obb_data.cls.cpu().numpy()
                        confs = obb_data.conf.cpu().numpy()

                        for box_data, cls_id, conf in zip(xywhr, cls_ids, confs, strict=False):
                            cx = float(max(min(box_data[0] / w, 1.0), 0.0))
                            cy = float(max(min(box_data[1] / h, 1.0), 0.0))
                            bw = float(max(min(box_data[2] / w, 1.0), 0.0))
                            bh = float(max(min(box_data[3] / h, 1.0), 0.0))
                            angle_deg = float(np.degrees(box_data[4]))

                            int_cls_id = int(cls_id)
                            cls_name = res.names.get(int_cls_id, f"class_{int_cls_id}")

                            instances.append(
                                ObbInstance(
                                    rbox=RotatedBoundingBox(
                                        [
                                            round(cx, 4),
                                            round(cy, 4),
                                            round(bw, 4),
                                            round(bh, 4),
                                            round(angle_deg, 2),
                                        ]
                                    ),
                                    class_id=int_cls_id,
                                    class_name=cls_name,
                                    confidence=round(float(conf), 4),
                                )
                            )

            obb_frames.append(
                ObbFrame(
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

        doc = SightForgeResultDocument4(
            schema_version=SchemaVersion.field_1_0_0,
            job_id=config.job_id,
            task="obb",
            model_variant=config.variant,
            mode=Mode(config.mode),
            media_type=MediaType(config.media_type),
            summary=summary,
            frames=obb_frames,
        )
        return SightForgeResultDocument(doc)
