/**
 * SightForge UI - Instance Segmentation Polygon Renderer (R55, R63, R64, R65)
 */

import type { NormalizedRegion, ViewerDisplayOptions } from "../types";
import {
  getClassColor,
  getTrackColor,
  drawOpaqueLabelChip,
  sanitizeText,
} from "../palette";

export function renderInstanceSegmentation(
  ctx: CanvasRenderingContext2D,
  region: NormalizedRegion,
  options: ViewerDisplayOptions,
  patternCanvas: HTMLCanvasElement | null,
  isSelected: boolean,
  isHovered: boolean,
  isDimmed: boolean,
): void {
  const polygon = region.polygon;
  if (!polygon || polygon.length < 3) {
    return;
  }

  const color =
    region.trackId !== undefined
      ? getTrackColor(region.trackId)
      : getClassColor(region.classId);

  ctx.save();
  if (isDimmed) {
    ctx.globalAlpha = 0.25;
  }

  // 1. Construct polygon vector path
  const firstPt = polygon[0];
  if (!firstPt) return;

  ctx.beginPath();
  ctx.moveTo(firstPt[0], firstPt[1]);
  for (let i = 1; i < polygon.length; i++) {
    const pt = polygon[i];
    if (pt) {
      ctx.lineTo(pt[0], pt[1]);
    }
  }
  ctx.closePath();

  // 2. Hatched pattern fill + semi-transparent tint (R63)
  if (patternCanvas) {
    const pattern = ctx.createPattern(patternCanvas, "repeat");
    if (pattern) {
      ctx.save();
      ctx.fillStyle = pattern;
      ctx.globalAlpha = isDimmed ? 0.15 : 0.4;
      ctx.fill();
      ctx.restore();
    }
  }

  // 3. Dual stroke halo around polygon contour (R64)
  const lineWidth = isSelected || isHovered ? 2.5 : 2;

  // Black halo
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = lineWidth + 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Light colored stroke
  ctx.strokeStyle = isSelected ? "#22D3EE" : color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.stroke();

  // 4. Opaque label chip
  if (options.showLabels) {
    const [x, y] = region.box;
    const trackPrefix =
      region.trackId !== undefined ? `#${region.trackId} ` : "";
    const cleanClassName = sanitizeText(region.className);
    const confidencePct = `${Math.round(region.confidence * 100)}%`;
    const label = `${trackPrefix}${cleanClassName} ${confidencePct}`;

    drawOpaqueLabelChip(ctx, label, x, y, color, isSelected || isHovered);
  }

  ctx.restore();
}
