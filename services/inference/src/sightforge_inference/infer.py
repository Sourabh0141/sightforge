"""SightForge Inference Service - GPU Inference Runner and Video Pipelines.

Implements the parameterized GPU inference class (R38, R48, KTD3), warm weights loading,
cold-start duration measurement (R45), the independent per-frame video pipeline (KTD7),
the stateful multi-object tracking video pipeline (R44, KTD6, KTD7), and volume hygiene (KTD4).
"""

import contextlib
import os
import tempfile
import time
from pathlib import Path
from typing import Any, cast

import modal
import numpy as np
from PIL import Image

from .adapter import InferenceConfig
from .app import (
    VOLUME_MOUNTS,
    app,
    frames_volume,
    gpu_image,
    inference_secrets,
)
from .config import (
    FRAMES_MOUNT_PATH,
    ModelVariant,
    VisionTask,
)
from .contracts.result import (
    BoundingBox,
    CoordinatePoint,
    DetectionTrack,
    DetectionTrackObservation,
    InstanceSegmentationTrack,
    InstanceSegmentationTrackObservation,
    MediaType,
    Mode,
    ObbTrack,
    ObbTrackObservation,
    PoseKeypoint,
    PoseTrack,
    PoseTrackObservation,
    ProcessingSummary,
    RotatedBoundingBox,
    SchemaVersion,
    SightForgeResultDocument,
    SightForgeResultDocument1,
    SightForgeResultDocument2,
    SightForgeResultDocument3,
    SightForgeResultDocument4,
)
from .media import (
    FrameManifest,
    cleanup_job_frames,
)
from .tasks import (
    BaseYOLOAdapter,
    get_task_adapter,
)
from .tasks.pose import COCO_KEYPOINT_NAMES
from .weights import (
    get_weight_metadata,
    get_weight_path,
    verify_weight_checksum,
)

# Named constant for mid-tier GPU accelerator (T4 / A10G / L4) per U7 benchmark plan
GPU_ACCELERATOR: str = "T4"

# Container global import timestamp to measure cold-start latency (R45)
MODULE_IMPORT_TIMESTAMP: float = time.perf_counter()

TRACKING_ELIGIBLE_TASKS: set[VisionTask] = {
    "detection",
    "instance_segmentation",
    "pose",
    "obb",
}


def build_tracker_config(
    job_id: str,
    fps: float,
    tolerance_seconds: float = 1.0,
    dest_dir: Path | None = None,
) -> Path:
    """Dynamically materializes a BoT-SORT tracker YAML with rate-derived buffer (KTD6, R44)."""
    track_buffer = max(int(round(tolerance_seconds * max(fps, 1.0))), 1)
    target_dir = dest_dir or Path(tempfile.gettempdir())
    target_dir.mkdir(parents=True, exist_ok=True)
    cfg_file = target_dir / f"tracker_{job_id}.yaml"

    content = f"""# SightForge Auto-Generated Tracker Config for Job {job_id}
tracker_type: botsort
track_high_thresh: 0.5
track_low_thresh: 0.1
new_track_thresh: 0.6
track_buffer: {track_buffer}
match_thresh: 0.8
fuse_score: True
gmc_method: sparseOptFlow
proximity_thresh: 0.5
appearance_thresh: 0.25
with_reid: False
"""
    cfg_file.write_text(content, encoding="utf-8")
    return cfg_file


def run_tracking_pipeline(
    adapter: BaseYOLOAdapter,
    frames: list[np.ndarray[Any, Any]],
    config: InferenceConfig,
    effective_fps: float,
) -> SightForgeResultDocument:
    """Executes stateful multi-object video tracking pipeline (R42, R44, KTD6, KTD7)."""
    if config.task not in TRACKING_ELIGIBLE_TASKS:
        raise ValueError(
            f"Tracking mode is not supported for task '{config.task}'. "
            "Tracking is only eligible for: detection, instance-segmentation, pose, obb (R42, R43)."
        )

    start_time = time.perf_counter()
    tracker_yaml = build_tracker_config(config.job_id, fps=effective_fps)

    # Reset predictor/tracker state before processing frame 0 to prevent ID carry-over (R44)
    if (
        adapter.model is not None
        and hasattr(adapter.model, "predictor")
        and adapter.model.predictor is not None
    ):
        adapter.model.predictor.trackers = []

    # Dictionary accumulating track observations keyed by track_id
    raw_tracks: dict[int, dict[str, Any]] = {}

    inference_start = time.perf_counter()
    for idx, frame in enumerate(frames):
        timestamp_ms = round((idx / effective_fps) * 1000.0, 2)
        h, w = frame.shape[:2]

        if adapter.model is not None:
            results = adapter.model.track(
                source=frame,
                persist=True,
                tracker=str(tracker_yaml),
                conf=config.confidence_threshold,
                iou=config.iou_threshold,
                device=config.device if config.device != "cuda" else 0,
                verbose=False,
            )
            if results and len(results) > 0:
                res = results[0]
                boxes = res.boxes
                obb_data = res.obb
                masks = res.masks
                keypoints_data = res.keypoints

                if (
                    config.task == "obb"
                    and obb_data is not None
                    and len(obb_data) > 0
                    and hasattr(obb_data, "id")
                    and obb_data.id is not None
                ):
                    t_ids = obb_data.id.cpu().numpy().astype(int)
                    xywhr = obb_data.xywhr.cpu().numpy()
                    cls_ids = obb_data.cls.cpu().numpy()
                    confs = obb_data.conf.cpu().numpy()

                    for tid, box_data, cls_id, conf in zip(
                        t_ids, xywhr, cls_ids, confs, strict=False
                    ):
                        cx = float(max(min(box_data[0] / w, 1.0), 0.0))
                        cy = float(max(min(box_data[1] / h, 1.0), 0.0))
                        bw = float(max(min(box_data[2] / w, 1.0), 0.0))
                        bh = float(max(min(box_data[3] / h, 1.0), 0.0))
                        angle_deg = float(np.degrees(box_data[4]))

                        int_cls_id = int(cls_id)
                        cls_name = res.names.get(int_cls_id, f"class_{int_cls_id}")
                        conf_val = float(conf)

                        obs = ObbTrackObservation(
                            frame_index=idx,
                            timestamp_ms=timestamp_ms,
                            rbox=RotatedBoundingBox(
                                [
                                    round(cx, 4),
                                    round(cy, 4),
                                    round(bw, 4),
                                    round(bh, 4),
                                    round(angle_deg, 2),
                                ]
                            ),
                            confidence=round(conf_val, 4),
                        )
                        if tid not in raw_tracks:
                            raw_tracks[tid] = {
                                "class_id": int_cls_id,
                                "class_name": cls_name,
                                "confs": [],
                                "observations": [],
                            }
                        raw_tracks[tid]["confs"].append(conf_val)
                        raw_tracks[tid]["observations"].append(obs)

                elif (
                    boxes is not None
                    and len(boxes) > 0
                    and hasattr(boxes, "id")
                    and boxes.id is not None
                ):
                    t_ids = boxes.id.cpu().numpy().astype(int)
                    for i, (tid, box) in enumerate(zip(t_ids, boxes, strict=False)):
                        xyxy = box.xyxy[0].cpu().numpy()
                        x_min = float(max(xyxy[0] / w, 0.0))
                        y_min = float(max(xyxy[1] / h, 0.0))
                        box_w = float(min((xyxy[2] - xyxy[0]) / w, 1.0 - x_min))
                        box_h = float(min((xyxy[3] - xyxy[1]) / h, 1.0 - y_min))

                        cls_id = int(box.cls[0].item())
                        conf = float(box.conf[0].item())
                        cls_name = res.names.get(cls_id, f"class_{cls_id}")
                        bbox = BoundingBox([x_min, y_min, box_w, box_h])

                        if config.task == "detection":
                            det_obs = DetectionTrackObservation(
                                frame_index=idx,
                                timestamp_ms=timestamp_ms,
                                box=bbox,
                                confidence=round(conf, 4),
                            )
                            if tid not in raw_tracks:
                                raw_tracks[tid] = {
                                    "class_id": cls_id,
                                    "class_name": cls_name,
                                    "confs": [],
                                    "observations": [],
                                }
                            raw_tracks[tid]["confs"].append(conf)
                            raw_tracks[tid]["observations"].append(det_obs)

                        elif config.task == "instance_segmentation":
                            poly_points = (
                                masks.xy[i] if (masks is not None and i < len(masks.xy)) else []
                            )
                            polygon_coords: list[CoordinatePoint] = []
                            for pt in poly_points:
                                px = float(max(min(pt[0] / w, 1.0), 0.0))
                                py = float(max(min(pt[1] / h, 1.0), 0.0))
                                polygon_coords.append(CoordinatePoint([round(px, 4), round(py, 4)]))
                            if len(polygon_coords) < 3:
                                polygon_coords = [
                                    CoordinatePoint([x_min, y_min]),
                                    CoordinatePoint([x_min + box_w, y_min]),
                                    CoordinatePoint([x_min + box_w, y_min + box_h]),
                                ]
                            seg_obs = InstanceSegmentationTrackObservation(
                                frame_index=idx,
                                timestamp_ms=timestamp_ms,
                                box=bbox,
                                polygon=polygon_coords,
                                confidence=round(conf, 4),
                            )
                            if tid not in raw_tracks:
                                raw_tracks[tid] = {
                                    "class_id": cls_id,
                                    "class_name": cls_name,
                                    "confs": [],
                                    "observations": [],
                                }
                            raw_tracks[tid]["confs"].append(conf)
                            raw_tracks[tid]["observations"].append(seg_obs)

                        elif config.task == "pose":
                            kpts_list: list[PoseKeypoint] = []
                            if keypoints_data is not None:
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
                            pose_obs = PoseTrackObservation(
                                frame_index=idx,
                                timestamp_ms=timestamp_ms,
                                box=bbox,
                                keypoints=kpts_list,
                                confidence=round(conf, 4),
                            )
                            if tid not in raw_tracks:
                                raw_tracks[tid] = {
                                    "class_id": cls_id,
                                    "class_name": cls_name,
                                    "confs": [],
                                    "observations": [],
                                }
                            raw_tracks[tid]["confs"].append(conf)
                            raw_tracks[tid]["observations"].append(pose_obs)
    inference_end = time.perf_counter()
    end_time = time.perf_counter()

    summary = ProcessingSummary(
        source_fps=config.source_fps or effective_fps,
        sampled_fps=effective_fps,
        frames_processed=len(frames),
        duration_ms=round((end_time - start_time) * 1000.0, 2),
        inference_duration_ms=round((inference_end - inference_start) * 1000.0, 2),
        cold_start_duration_ms=0.0,
    )

    with contextlib.suppress(Exception):
        tracker_yaml.unlink(missing_ok=True)

    if config.task == "detection":
        det_tracks: list[DetectionTrack] = []
        for tid, data in raw_tracks.items():
            avg_conf = float(np.mean(data["confs"])) if data["confs"] else 0.0
            det_tracks.append(
                DetectionTrack(
                    track_id=tid,
                    class_id=data["class_id"],
                    class_name=data["class_name"],
                    confidence_avg=round(avg_conf, 4),
                    observations=data["observations"],
                )
            )
        doc1 = SightForgeResultDocument1(
            schema_version=SchemaVersion.field_1_0_0,
            job_id=config.job_id,
            task="detection",
            model_variant=config.variant,
            mode=Mode.tracking,
            media_type=MediaType(config.media_type),
            summary=summary,
            tracks=det_tracks,
        )
        return SightForgeResultDocument(doc1)

    if config.task == "instance_segmentation":
        seg_tracks: list[InstanceSegmentationTrack] = []
        for tid, data in raw_tracks.items():
            avg_conf = float(np.mean(data["confs"])) if data["confs"] else 0.0
            seg_tracks.append(
                InstanceSegmentationTrack(
                    track_id=tid,
                    class_id=data["class_id"],
                    class_name=data["class_name"],
                    confidence_avg=round(avg_conf, 4),
                    observations=data["observations"],
                )
            )
        doc2 = SightForgeResultDocument2(
            schema_version=SchemaVersion.field_1_0_0,
            job_id=config.job_id,
            task="instance-segmentation",
            model_variant=config.variant,
            mode=Mode.tracking,
            media_type=MediaType(config.media_type),
            summary=summary,
            tracks=seg_tracks,
        )
        return SightForgeResultDocument(doc2)

    if config.task == "pose":
        pose_tracks: list[PoseTrack] = []
        for tid, data in raw_tracks.items():
            avg_conf = float(np.mean(data["confs"])) if data["confs"] else 0.0
            pose_tracks.append(
                PoseTrack(
                    track_id=tid,
                    class_id=data["class_id"],
                    class_name=data["class_name"],
                    confidence_avg=round(avg_conf, 4),
                    observations=data["observations"],
                )
            )
        doc3 = SightForgeResultDocument3(
            schema_version=SchemaVersion.field_1_0_0,
            job_id=config.job_id,
            task="pose",
            model_variant=config.variant,
            mode=Mode.tracking,
            media_type=MediaType(config.media_type),
            summary=summary,
            tracks=pose_tracks,
        )
        return SightForgeResultDocument(doc3)

    # OBB task
    obb_tracks: list[ObbTrack] = []
    for tid, data in raw_tracks.items():
        avg_conf = float(np.mean(data["confs"])) if data["confs"] else 0.0
        obb_tracks.append(
            ObbTrack(
                track_id=tid,
                class_id=data["class_id"],
                class_name=data["class_name"],
                confidence_avg=round(avg_conf, 4),
                observations=data["observations"],
            )
        )
    doc4 = SightForgeResultDocument4(
        schema_version=SchemaVersion.field_1_0_0,
        job_id=config.job_id,
        task="obb",
        model_variant=config.variant,
        mode=Mode.tracking,
        media_type=MediaType(config.media_type),
        summary=summary,
        tracks=obb_tracks,
    )
    return SightForgeResultDocument(doc4)


@app.cls(
    gpu=GPU_ACCELERATOR,
    image=gpu_image,
    volumes=cast(Any, VOLUME_MOUNTS),
    secrets=[inference_secrets],
    timeout=300,
    scaledown_window=60,
)
class InferenceRunner:
    """Parameterized GPU inference container class running vision pipelines (R38, R48, KTD3)."""

    task: str = modal.parameter(default="detection")
    variant: str = modal.parameter(default="nano")

    @modal.enter()
    def enter(self) -> None:
        """Modal enter hook loading weights once per container lifecycle (KTD3, R39)."""
        # Isolate Ultralytics runtime config directory in container
        os.environ["YOLO_CONFIG_DIR"] = "/tmp/ultralytics"
        os.environ["ULTRALYTICS_AUTO_UPDATE"] = "0"

        vision_task = cast(VisionTask, self.task)
        model_variant = cast(ModelVariant, self.variant)

        # Instantiate task adapter
        self.adapter: BaseYOLOAdapter | None = get_task_adapter(vision_task, variant=model_variant)

        # Resolve weight path from volume and verify checksum
        weights_path = get_weight_path(vision_task, model_variant)
        if weights_path.exists():
            meta = get_weight_metadata(vision_task, model_variant)
            if meta:
                verify_weight_checksum(weights_path, meta.sha256)
            self.adapter.load_model(weights_path)

        self._enter_time: float = time.perf_counter()
        self._cold_start_served: bool = False

    @modal.method()
    def infer_frames(
        self,
        config: InferenceConfig,
        manifest: FrameManifest,
    ) -> SightForgeResultDocument:
        """Executes inference pipeline over frames on volume with volume cleanup (KTD4)."""
        vision_task = cast(VisionTask, self.task)
        model_variant = cast(ModelVariant, self.variant)

        if not hasattr(self, "adapter") or self.adapter is None:
            self.adapter = get_task_adapter(vision_task, variant=model_variant)

        # Measure container cold-start duration on first served invocation (R45)
        cold_start_ms = 0.0
        if not getattr(self, "_cold_start_served", False):
            enter_t = getattr(self, "_enter_time", MODULE_IMPORT_TIMESTAMP)
            cold_start_ms = max(round((enter_t - MODULE_IMPORT_TIMESTAMP) * 1000.0, 2), 0.0)
            self._cold_start_served = True

        try:
            # Read frame images directly from volume paths (KTD4)
            frames_list: list[np.ndarray[Any, Any]] = []
            for entry in manifest.frames:
                frame_path = Path(entry.file_path)
                if frame_path.exists():
                    with Image.open(frame_path) as img:
                        frames_list.append(np.array(img.convert("RGB")))
                else:
                    # Fallback blank frame if path missing
                    frames_list.append(
                        np.zeros((entry.height or 480, entry.width or 640, 3), dtype=np.uint8)
                    )

            if config.mode == "tracking":
                result = run_tracking_pipeline(
                    adapter=self.adapter,
                    frames=frames_list,
                    config=config,
                    effective_fps=manifest.sampled_fps or manifest.source_fps,
                )
            else:
                result = self.adapter.infer(frames_list, config)

            # Assign measured cold-start duration to summary
            if hasattr(result.root, "summary") and result.root.summary is not None:
                result.root.summary.cold_start_duration_ms = cold_start_ms

            return result

        finally:
            # Ensure volume hygiene cleanup runs on both success and failure (KTD4)
            with contextlib.suppress(Exception):
                cleanup_job_frames(config.job_id, Path(FRAMES_MOUNT_PATH))
                frames_volume.commit()
