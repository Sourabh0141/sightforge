/**
 * SightForge UI - Viewer Types & Interfaces (R55, R56, R62, R63, R64, R65, R66, KTD3)
 */

import type {
  SightForgeResultDocument,
  BoundingBox,
  RotatedBoundingBox,
  CoordinatePoint,
  PoseKeypoint,
} from "@sightforge/contracts";

export type SparseTaskType =
  "detection" | "instance-segmentation" | "pose" | "obb" | "classification";

export type AllTaskType = SparseTaskType | "semantic-segmentation" | "depth";

/**
 * Normalized visual region item rendered onto the canvas and accessible listbox.
 */
export interface NormalizedRegion {
  id: string;
  task: string;
  frameIndex: number;
  classId: number;
  className: string;
  confidence: number;
  box: BoundingBox; // [x, y, w, h]
  trackId?: number;
  rawInstance?: any;
  // Task specific shapes
  rbox?: RotatedBoundingBox; // [cx, cy, w, h, angle_deg] for OBB
  polygon?: CoordinatePoint[]; // [[x, y], ...] for Instance Segmentation
  keypoints?: PoseKeypoint[]; // COCO 17 keypoints for Pose
  // Trajectory history for tracking
  trajectory?: Array<{
    frameIndex: number;
    x: number;
    y: number;
  }>;
}

/**
 * Summarized track representation for video tracking results.
 */
export interface TrackGroup {
  trackId: number;
  classId: number;
  className: string;
  confidenceAvg: number;
  firstFrameIndex: number;
  lastFrameIndex: number;
  totalObservations: number;
  color: string;
  observations: Array<{
    frameIndex: number;
    timestampMs: number;
    box: BoundingBox;
    confidence: number;
    rbox?: RotatedBoundingBox;
    polygon?: CoordinatePoint[];
    keypoints?: PoseKeypoint[];
  }>;
}

/**
 * Viewer filtering & display options.
 */
export interface ViewerDisplayOptions {
  minConfidence: number; // 0.0 to 1.0 (default 0.25)
  showOverlays: boolean; // default true
  showLabels: boolean; // default true
  showTracks: boolean; // default true
  showCrosshairs: boolean; // default true
  activeRegionId: string | null;
  hoveredRegionId: string | null;
  selectedTrackId: number | null;
  selectedClassIds: number[]; // empty array means all classes visible
}

/**
 * Coordinate transform viewport state (zoom and pan).
 */
export interface ViewportTransform {
  zoom: number; // 1.0 = 100%
  panX: number; // in screen pixels
  panY: number; // in screen pixels
}

/**
 * Top-level props for the unified ViewerShell.
 */
export interface ViewerShellProps {
  document: SightForgeResultDocument;
  mediaUrl?: string;
  className?: string;
  onRegionSelect?: (region: NormalizedRegion | null) => void;
  onRegionHover?: (region: NormalizedRegion | null) => void;
  readOnly?: boolean;
}
