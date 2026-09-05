/**
 * SightForge UI - Pose Estimation Skeleton Renderer (R55, R63, R64, R65)
 */

import type { NormalizedRegion, ViewerDisplayOptions } from "../types";
import {
  getClassColor,
  getTrackColor,
  drawOpaqueLabelChip,
  sanitizeText,
} from "../palette";

/**
 * Standard COCO 17-keypoint skeleton connectivity topology (19 limb bones).
 */
export const COCO_SKELETON_PAIRS: Array<[number, number]> = [
  // Head
  [0, 1], // nose -> left_eye
  [0, 2], // nose -> right_eye
  [1, 3], // left_eye -> left_ear
  [2, 4], // right_eye -> right_ear
  // Torso
  [5, 6], // left_shoulder -> right_shoulder
  [5, 11], // left_shoulder -> left_hip
  [6, 12], // right_shoulder -> right_hip
  [11, 12], // left_hip -> right_hip
  // Left Arm
  [5, 7], // left_shoulder -> left_elbow
  [7, 9], // left_elbow -> left_wrist
  // Right Arm
  [6, 8], // right_shoulder -> right_elbow
  [8, 10], // right_elbow -> right_wrist
  // Left Leg
  [11, 13], // left_hip -> left_knee
  [13, 15], // left_knee -> left_ankle
  // Right Leg
  [12, 14], // right_hip -> right_knee
  [14, 16], // right_knee -> right_ankle
];

export function renderPoseInstance(
  ctx: CanvasRenderingContext2D,
  region: NormalizedRegion,
  options: ViewerDisplayOptions,
  isSelected: boolean,
  isHovered: boolean,
  isDimmed: boolean,
): void {
  const keypoints = region.keypoints;
  const color =
    region.trackId !== undefined
      ? getTrackColor(region.trackId)
      : getClassColor(region.classId);

  ctx.save();
  if (isDimmed) {
    ctx.globalAlpha = 0.25;
  }

  // 1. Optional subtle dashed bounding box
  const [x, y, w, h] = region.box;
  ctx.save();
  ctx.strokeStyle = "#252B37";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();

  if (keypoints && keypoints.length > 0) {
    // Map keypoints by index for fast lookup
    const kpMap = new Map<
      number,
      { x: number; y: number; confidence: number; visible: boolean }
    >();
    for (const kp of keypoints) {
      if (kp.visible !== false && kp.confidence >= 0.2) {
        kpMap.set(kp.index, kp);
      }
    }

    // 2. Draw 19 limb bones (Dual stroke halo)
    for (const [idxA, idxB] of COCO_SKELETON_PAIRS) {
      const kpA = kpMap.get(idxA);
      const kpB = kpMap.get(idxB);
      if (kpA && kpB) {
        // Black halo
        ctx.beginPath();
        ctx.moveTo(kpA.x, kpA.y);
        ctx.lineTo(kpB.x, kpB.y);
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = isSelected ? 5 : 4;
        ctx.lineCap = "round";
        ctx.stroke();

        // Light colored bone stroke
        ctx.beginPath();
        ctx.moveTo(kpA.x, kpA.y);
        ctx.lineTo(kpB.x, kpB.y);
        ctx.strokeStyle = isSelected ? "#22D3EE" : color;
        ctx.lineWidth = isSelected ? 2.5 : 2;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }

    // 3. Draw keypoint node dots
    for (const kp of keypoints) {
      if (kp.visible === false || kp.confidence < 0.2) continue;

      const radius = isSelected ? 4.5 : 3.5;

      // Outer black halo
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, radius + 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = "#000000";
      ctx.fill();

      // Inner colored dot
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? "#22D3EE" : color;
      ctx.fill();
    }
  }

  // 4. Opaque label chip
  if (options.showLabels) {
    const trackPrefix =
      region.trackId !== undefined ? `#${region.trackId} ` : "";
    const cleanClassName = sanitizeText(region.className);
    const confidencePct = `${Math.round(region.confidence * 100)}%`;
    const label = `${trackPrefix}${cleanClassName} ${confidencePct}`;

    drawOpaqueLabelChip(ctx, label, x, y, color, isSelected || isHovered);
  }

  ctx.restore();
}
