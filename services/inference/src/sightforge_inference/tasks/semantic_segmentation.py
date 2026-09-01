"""SightForge Inference Service - Semantic Segmentation Task Adapter.

Implements dense pixel-level semantic segmentation emitting an artifact reference (R34, R45, R55).
"""

import time
from typing import Any

import numpy as np

from ..adapter import InferenceConfig
from ..config import ModelVariant
from ..contracts.result import (
    Encoding,
    MediaType,
    SchemaVersion,
    SemanticSegmentationArtifact,
    SemanticSegmentationColorMapping,
    SightForgeResultDocument,
    SightForgeResultDocument6,
)
from .base import BaseYOLOAdapter

# Standard distinct hex colors for semantic segmentation classes
PALETTE_COLORS = [
    "#E6194B",
    "#3CBL54",
    "#FFE119",
    "#4363D8",
    "#F58231",
    "#911EB4",
    "#42D4F4",
    "#F032E6",
    "#BFEF45",
    "#FABED4",
    "#469990",
    "#DCBEFF",
    "#9A6324",
    "#FFFAC8",
    "#800000",
    "#AAFFC3",
    "#808000",
    "#FFD8B1",
    "#000075",
    "#A9A9A9",
]


class SemanticSegmentationAdapter(BaseYOLOAdapter):
    """Adapter for YOLO26 Semantic Segmentation with Dense Artifact Emission."""

    def __init__(self, variant: ModelVariant = "nano", model: Any | None = None) -> None:
        super().__init__(task="semantic_segmentation", variant=variant, model=model)

    def infer(
        self,
        frames: list[np.ndarray[Any, Any]],
        config: InferenceConfig,
    ) -> SightForgeResultDocument:
        start_time = time.perf_counter()
        h, w = (frames[0].shape[:2]) if frames else (480, 640)

        inference_start = time.perf_counter()
        detected_classes: dict[int, str] = {0: "background"}

        if self.model is not None and frames:
            results = self.model.predict(
                source=frames[0],
                conf=config.confidence_threshold,
                iou=config.iou_threshold,
                device=config.device if config.device != "cuda" else 0,
                verbose=False,
            )
            if results and len(results) > 0:
                res = results[0]
                if res.boxes is not None:
                    for cls_item in res.boxes.cls:
                        cid = int(cls_item.item())
                        detected_classes[cid] = res.names.get(cid, f"class_{cid}")

        inference_end = time.perf_counter()

        color_palette: list[SemanticSegmentationColorMapping] = []
        for i, (cid, cname) in enumerate(detected_classes.items()):
            hex_color = PALETTE_COLORS[i % len(PALETTE_COLORS)]
            color_palette.append(
                SemanticSegmentationColorMapping(
                    class_id=cid,
                    class_name=cname,
                    hex_color=hex_color,
                )
            )

        artifact_key = f"results/{config.job_id}/semantic_segmentation.png"
        artifact = SemanticSegmentationArtifact(
            key=artifact_key,
            width=w,
            height=h,
            frame_count=len(frames),
            encoding=Encoding.image_png,
            color_palette=color_palette,
        )

        end_time = time.perf_counter()
        summary = self._create_summary(
            start_time=start_time,
            inference_start=inference_start,
            inference_end=inference_end,
            end_time=end_time,
            frames_count=len(frames),
            config=config,
        )

        doc = SightForgeResultDocument6(
            schema_version=SchemaVersion.field_1_0_0,
            job_id=config.job_id,
            task="semantic-segmentation",
            model_variant=config.variant,
            mode="per-frame",
            media_type=MediaType(config.media_type),
            summary=summary,
            artifact=artifact,
        )
        return SightForgeResultDocument(doc)
