/**
 * SightForge UI - Oriented Bounding Box (OBB) Renderer (R55, R63, R64, R65)
 */

import type { NormalizedRegion, ViewerDisplayOptions } from "../types";
import {
  getClassColor,
  getTrackColor,
  drawOpaqueLabelChip,
  sanitizeText,
} from "../palette";

export function renderObbInstance(
  ctx: CanvasRenderingContext2D,
  region: NormalizedRegion,
  options: ViewerDisplayOptions,
  isSelected: boolean,
  isHovered: boolean,
  isDimmed: boolean,
): void {
  if (!region.rbox) {
    return;
  }

  const [cx, cy, w, h, angleDeg] = region.rbox;
  const color =
    region.trackId !== undefined
      ? getTrackColor(region.trackId)
      : getClassColor(region.classId);
  const rad = (angleDeg * Math.PI) / 180;

  ctx.save();
  if (isDimmed) {
    ctx.globalAlpha = 0.25;
  }

  // 1. Transform to center and rotate
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad);

  const halfW = w / 2;
  const halfH = h / 2;
  const lineWidth = isSelected || isHovered ? 2.5 : 2;

  // Black halo beneath
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = lineWidth + 2;
  ctx.strokeRect(-halfW, -halfH, w, h);

  // Colored light stroke
  ctx.strokeStyle = isSelected ? "#22D3EE" : color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(-halfW, -halfH, w, h);

  // Orientation heading indicator line and arrow (points in direction of angle)
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(halfW + 10, 0);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(halfW + 10, 0);
  ctx.strokeStyle = isSelected ? "#22D3EE" : color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Arrow head
  ctx.beginPath();
  ctx.moveTo(halfW + 10, 0);
  ctx.lineTo(halfW + 4, -4);
  ctx.lineTo(halfW + 4, 4);
  ctx.closePath();
  ctx.fillStyle = isSelected ? "#22D3EE" : color;
  ctx.fill();

  ctx.restore();

  // 2. Opaque label chip placed near top-left of rotated bounding box
  if (options.showLabels) {
    const trackPrefix =
      region.trackId !== undefined ? `#${region.trackId} ` : "";
    const cleanClassName = sanitizeText(region.className);
    const confidencePct = `${Math.round(region.confidence * 100)}%`;
    const angleText = `${angleDeg.toFixed(1)}°`;
    const label = `${trackPrefix}${cleanClassName} ${confidencePct} (${angleText})`;

    // Derive approximate top-left point of the rotated box in canvas coords
    const [minX, minY] = region.box;
    drawOpaqueLabelChip(ctx, label, minX, minY, color, isSelected || isHovered);
  }

  ctx.restore();
}
