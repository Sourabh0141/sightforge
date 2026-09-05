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

export type DenseTaskType = "semantic-segmentation" | "depth";

export type AllTaskType = SparseTaskType | DenseTaskType;

/**
 * Colormap choices for depth estimation visualization (R55).
 */
export type DepthColormap =
  "turbo" | "viridis" | "plasma" | "inferno" | "grayscale";

/**
 * Artifact resolver function injected into ViewerShell (R50, R58, KTD3).
 * Authenticated apps supply an API-backed presigned resolver; public demo gallery supplies static paths.
 */
export type ArtifactResolver = (
  key: string,
  frameIndex?: number,
) => Promise<string> | string;

/**
 * Summarized per-class coverage for semantic segmentation (KTD4, R66).
 */
export interface SemanticClassSummary {
  classId: number;
  className: string;
  hexColor: string;
  coveragePercent: number; // 0.0 - 100.0%
  occupiedSectors: string[]; // e.g. ["upper-third", "lower-half"]
}

/**
 * Sector information in the coarse 3x3 spatial depth grid (KTD4).
 */
export interface DepthSectorInfo {
  row: "top" | "mid" | "bottom";
  col: "left" | "center" | "right";
  sectorName: string; // e.g. "Top-Left", "Center"
  avgDepthMeters: number;
  category: "foreground" | "midground" | "background";
}

/**
 * Depth band summary category.
 */
export interface DepthBandSummary {
  category: "foreground" | "midground" | "background";
  label: string;
  minDepthMeters: number;
  maxDepthMeters: number;
  coveragePercent: number;
}

/**
 * Summarized spatial & metric depth representation (KTD4, R55, R66).
 */
export interface DepthSpatialSummary {
  unit: "meters" | string;
  minDepthMeters: number;
  maxDepthMeters: number;
  medianDepthMeters: number;
  bands: DepthBandSummary[];
  spatialGrid: DepthSectorInfo[]; // 9 items in 3x3 layout
  textSummary: string;
}

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
  // Dense options (R55, KTD4)
  overlayOpacity: number; // 0.0 to 1.0 (default 0.60)
  depthColormap: DepthColormap; // default "turbo"
  viewMode: "visual" | "inspector"; // default "visual"
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
  resolveArtifact?: ArtifactResolver;
  className?: string;
  onRegionSelect?: (region: NormalizedRegion | null) => void;
  onRegionHover?: (region: NormalizedRegion | null) => void;
  readOnly?: boolean;
}
