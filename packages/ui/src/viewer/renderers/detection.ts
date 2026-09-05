/**
 * SightForge UI - Object Detection Renderer (R55, R63, R64, R65)
 */

import type { NormalizedRegion, ViewerDisplayOptions } from "../types";
import {
  getClassColor,
  getTrackColor,
  drawDoubleStrokeRect,
  drawOpaqueLabelChip,
  sanitizeText,
} from "../palette";

export function renderDetectionInstance(
  ctx: CanvasRenderingContext2D,
  region: NormalizedRegion,
  options: ViewerDisplayOptions,
  isSelected: boolean,
  isHovered: boolean,
  isDimmed: boolean,
): void {
  const [x, y, w, h] = region.box;
  const color =
    region.trackId !== undefined
      ? getTrackColor(region.trackId)
      : getClassColor(region.classId);

  ctx.save();
  if (isDimmed) {
    ctx.globalAlpha = 0.25;
  }

  // 1. Double stroke rectangular boundary (R64)
  const lineWidth = isSelected || isHovered ? 2.5 : 2;
  drawDoubleStrokeRect(ctx, x, y, w, h, color, lineWidth, isSelected);

  // 2. Opaque label chip (R65)
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
