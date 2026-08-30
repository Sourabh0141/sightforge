/* eslint-disable */
/**
 * Auto-generated from result.schema.json. Do not edit manually.
 */

/**
 * Canonical result document contract for SightForge computer vision tasks
 */
export type SightForgeResultDocument = {
  /**
   * Contract schema version per R51
   */
  schema_version: "1.0.0";
  /**
   * Unique identifier for the job
   */
  job_id: string;
  /**
   * Computer vision task discriminator
   */
  task:
    | "detection"
    | "instance-segmentation"
    | "pose"
    | "obb"
    | "classification"
    | "semantic-segmentation"
    | "depth";
  /**
   * Model architecture variant name (e.g. yolo26n, yolo26s)
   */
  model_variant: string;
  /**
   * Processing mode: independent per-frame analysis or video tracking
   */
  mode: "per-frame" | "tracking";
  /**
   * Original media type
   */
  media_type: "image" | "video";
  summary: ProcessingSummary;
  [k: string]: unknown;
} & (
  | DetectionResult
  | InstanceSegmentationResult
  | PoseResult
  | ObbResult
  | ClassificationResult
  | SemanticSegmentationResult
  | DepthResult
);
export type DetectionResult = {
  task?: "detection";
  frames?: DetectionFrame[];
  tracks?: DetectionTrack[];
  [k: string]: unknown;
} & DetectionResult1;
/**
 * [x_min, y_min, width, height] normalized or pixel coordinates
 *
 * @minItems 4
 * @maxItems 4
 */
export type BoundingBox = [number, number, number, number];
export type DetectionResult1 =
  | {
      mode?: "per-frame";
      [k: string]: unknown;
    }
  | {
      mode?: "tracking";
      [k: string]: unknown;
    };
export type InstanceSegmentationResult = {
  task?: "instance-segmentation";
  frames?: InstanceSegmentationFrame[];
  tracks?: InstanceSegmentationTrack[];
  [k: string]: unknown;
} & InstanceSegmentationResult1;
/**
 * [x, y]
 *
 * @minItems 2
 * @maxItems 2
 */
export type CoordinatePoint = [number, number];
export type InstanceSegmentationResult1 =
  | {
      mode?: "per-frame";
      [k: string]: unknown;
    }
  | {
      mode?: "tracking";
      [k: string]: unknown;
    };
export type PoseResult = {
  task?: "pose";
  frames?: PoseFrame[];
  tracks?: PoseTrack[];
  [k: string]: unknown;
} & PoseResult1;
export type PoseResult1 =
  | {
      mode?: "per-frame";
      [k: string]: unknown;
    }
  | {
      mode?: "tracking";
      [k: string]: unknown;
    };
export type ObbResult = {
  task?: "obb";
  frames?: ObbFrame[];
  tracks?: ObbTrack[];
  [k: string]: unknown;
} & ObbResult1;
/**
 * [center_x, center_y, width, height, angle_degrees]
 *
 * @minItems 5
 * @maxItems 5
 */
export type RotatedBoundingBox = [number, number, number, number, number];
export type ObbResult1 =
  | {
      mode?: "per-frame";
      [k: string]: unknown;
    }
  | {
      mode?: "tracking";
      [k: string]: unknown;
    };

export interface ProcessingSummary {
  source_fps: number;
  sampled_fps: number;
  frames_processed: number;
  duration_ms: number;
  inference_duration_ms: number;
  cold_start_duration_ms: number;
}
export interface DetectionFrame {
  frame_index: number;
  timestamp_ms: number;
  instances: DetectionInstance[];
}
export interface DetectionInstance {
  box: BoundingBox;
  class_id: number;
  class_name: string;
  confidence: number;
}
export interface DetectionTrack {
  track_id: number;
  class_id: number;
  class_name: string;
  confidence_avg: number;
  observations: DetectionTrackObservation[];
}
export interface DetectionTrackObservation {
  frame_index: number;
  timestamp_ms: number;
  box: BoundingBox;
  confidence: number;
}
export interface InstanceSegmentationFrame {
  frame_index: number;
  timestamp_ms: number;
  instances: InstanceSegmentationInstance[];
}
export interface InstanceSegmentationInstance {
  box: BoundingBox;
  /**
   * @minItems 3
   */
  polygon: [
    CoordinatePoint,
    CoordinatePoint,
    CoordinatePoint,
    ...CoordinatePoint[],
  ];
  class_id: number;
  class_name: string;
  confidence: number;
}
export interface InstanceSegmentationTrack {
  track_id: number;
  class_id: number;
  class_name: string;
  confidence_avg: number;
  observations: InstanceSegmentationTrackObservation[];
}
export interface InstanceSegmentationTrackObservation {
  frame_index: number;
  timestamp_ms: number;
  box: BoundingBox;
  /**
   * @minItems 3
   */
  polygon: [
    CoordinatePoint,
    CoordinatePoint,
    CoordinatePoint,
    ...CoordinatePoint[],
  ];
  confidence: number;
}
export interface PoseFrame {
  frame_index: number;
  timestamp_ms: number;
  instances: PoseInstance[];
}
export interface PoseInstance {
  box: BoundingBox;
  /**
   * @minItems 1
   */
  keypoints: [PoseKeypoint, ...PoseKeypoint[]];
  class_id: number;
  class_name: string;
  confidence: number;
}
export interface PoseKeypoint {
  x: number;
  y: number;
  confidence: number;
  visible: boolean;
  name: string;
  index: number;
}
export interface PoseTrack {
  track_id: number;
  class_id: number;
  class_name: string;
  confidence_avg: number;
  observations: PoseTrackObservation[];
}
export interface PoseTrackObservation {
  frame_index: number;
  timestamp_ms: number;
  box: BoundingBox;
  /**
   * @minItems 1
   */
  keypoints: [PoseKeypoint, ...PoseKeypoint[]];
  confidence: number;
}
export interface ObbFrame {
  frame_index: number;
  timestamp_ms: number;
  instances: ObbInstance[];
}
export interface ObbInstance {
  rbox: RotatedBoundingBox;
  class_id: number;
  class_name: string;
  confidence: number;
}
export interface ObbTrack {
  track_id: number;
  class_id: number;
  class_name: string;
  confidence_avg: number;
  observations: ObbTrackObservation[];
}
export interface ObbTrackObservation {
  frame_index: number;
  timestamp_ms: number;
  rbox: RotatedBoundingBox;
  confidence: number;
}
export interface ClassificationResult {
  task?: "classification";
  mode?: "per-frame";
  frames: ClassificationFrame[];
  [k: string]: unknown;
}
export interface ClassificationFrame {
  frame_index: number;
  timestamp_ms: number;
  /**
   * @minItems 1
   */
  predictions: [ClassificationPrediction, ...ClassificationPrediction[]];
}
export interface ClassificationPrediction {
  class_id: number;
  class_name: string;
  confidence: number;
  rank: number;
}
export interface SemanticSegmentationResult {
  task?: "semantic-segmentation";
  mode?: "per-frame";
  artifact: SemanticSegmentationArtifact;
  [k: string]: unknown;
}
export interface SemanticSegmentationArtifact {
  /**
   * R2 artifact object key
   */
  key: string;
  width: number;
  height: number;
  frame_count: number;
  encoding: "image/png";
  color_palette: SemanticSegmentationColorMapping[];
}
export interface SemanticSegmentationColorMapping {
  class_id: number;
  class_name: string;
  hex_color: string;
}
export interface DepthResult {
  task?: "depth";
  mode?: "per-frame";
  artifact: DepthArtifact;
  [k: string]: unknown;
}
export interface DepthArtifact {
  /**
   * R2 artifact object key
   */
  key: string;
  width: number;
  height: number;
  frame_count: number;
  encoding: "image/png";
  depth_metadata: DepthMetadata;
}
export interface DepthMetadata {
  unit: "meters";
  scale_factor: number;
  min_depth_meters: number;
  max_depth_meters: number;
}
