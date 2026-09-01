"""SightForge Inference Service - Pose Estimation Task Adapter.

Implements human pose estimation emitting 17 canonical COCO keypoints (R34, R45).
"""

import time
from typing import Any

import numpy as np

from ..adapter import InferenceConfig
from ..config import ModelVariant
from ..contracts.result import (
    BoundingBox,
    MediaType,
    Mode,
    PoseFrame,
    PoseInstance,
    PoseKeypoint,
    SchemaVersion,
    SightForgeResultDocument,
    SightForgeResultDocument3,
)
from .base import BaseYOLOAdapter

COCO_KEYPOINT_NAMES = [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]


class PoseAdapter(BaseYOLOAdapter):
    """Adapter for YOLO26 Human Pose Estimation."""

    def __init__(self, variant: ModelVariant = "nano", model: Any | None = None) -> None:
        super().__init__(task="pose", variant=variant, model=model)

    def infer(
        self,
        frames: list[np.ndarray[Any, Any]],
        config: InferenceConfig,
    ) -> SightForgeResultDocument:
        start_time = time.perf_counter()
        pose_frames: list[PoseFrame] = []

        inference_start = time.perf_counter()
        for idx, frame in enumerate(frames):
            timestamp_ms = round((idx / (config.sampled_fps or 30.0)) * 1000.0, 2)
            instances: list[PoseInstance] = []

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
                    keypoints_data = res.keypoints
                    if boxes is not None and keypoints_data is not None and len(boxes) > 0:
                        h, w = frame.shape[:2]
                        for i, box in enumerate(boxes):
                            xyxy = box.xyxy[0].cpu().numpy()
                            x_min = float(max(xyxy[0] / w, 0.0))
                            y_min = float(max(xyxy[1] / h, 0.0))
                            box_w = float(min((xyxy[2] - xyxy[0]) / w, 1.0 - x_min))
                            box_h = float(min((xyxy[3] - xyxy[1]) / h, 1.0 - y_min))

                            cls_id = int(box.cls[0].item())
                            conf = float(box.conf[0].item())
                            cls_name = res.names.get(cls_id, "person")

                            kpts_list: list[PoseKeypoint] = []
                            kpts_xy = keypoints_data.xy[i].cpu().numpy()
                            kpts_conf = (
                                keypoints_data.conf[i].cpu().numpy()
                                if keypoints_data.conf is not None
                                else np.ones(len(kpts_xy))
                            )

                            for k_idx, (kpt, k_conf) in enumerate(
                                zip(kpts_xy, kpts_conf, strict=False)
                            ):
                                if k_idx >= len(COCO_KEYPOINT_NAMES):
                                    break
                                k_name = COCO_KEYPOINT_NAMES[k_idx]
                                kx = float(max(min(kpt[0] / w, 1.0), 0.0))
                                ky = float(max(min(kpt[1] / h, 1.0), 0.0))
                                k_conf_val = float(k_conf)
                                is_visible = k_conf_val >= config.confidence_threshold

                                kpts_list.append(
                                    PoseKeypoint(
                                        x=round(kx, 4),
                                        y=round(ky, 4),
                                        confidence=round(k_conf_val, 4),
                                        visible=is_visible,
                                        name=k_name,
                                        index=k_idx,
                                    )
                                )

                            instances.append(
                                PoseInstance(
                                    box=BoundingBox([x_min, y_min, box_w, box_h]),
                                    keypoints=kpts_list,
                                    class_id=cls_id,
                                    class_name=cls_name,
                                    confidence=round(conf, 4),
                                )
                            )

            pose_frames.append(
                PoseFrame(
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

        doc = SightForgeResultDocument3(
            schema_version=SchemaVersion.field_1_0_0,
            job_id=config.job_id,
            task="pose",
            model_variant=config.variant,
            mode=Mode(config.mode),
            media_type=MediaType(config.media_type),
            summary=summary,
            frames=pose_frames,
        )
        return SightForgeResultDocument(doc)
