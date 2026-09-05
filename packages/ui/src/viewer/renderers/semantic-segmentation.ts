/**
 * SightForge UI - Semantic Segmentation Continuous Overlay Renderer (R55, R63, R64, R65, KTD3)
 *
 * Renders per-pixel semantic class mask overlays onto the 2D canvas with:
 * - Controllable alpha blending / opacity against background media.
 * - Active class isolation and highlighting.
 * - Dual-encoded class badges with pattern identifiers (R63).
 */

import type { SemanticSegmentationColorMapping } from "@sightforge/contracts";
import type { ViewerDisplayOptions, ViewportTransform } from "../types";
import { sanitizeText } from "../palette";

export interface DrawSemanticOverlayParams {
  ctx: CanvasRenderingContext2D;
  maskImage: HTMLImageElement | ImageBitmap | HTMLCanvasElement | null;
  colorPalette: SemanticSegmentationColorMapping[];
  imgWidth: number;
  imgHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  options: ViewerDisplayOptions;
  transform: ViewportTransform;
}

/**
 * Draws the decoded semantic segmentation mask over the canvas with opacity and transform.
 */
export function drawSemanticSegmentationOverlay({
  ctx,
  maskImage,
  colorPalette,
  imgWidth,
  imgHeight,
  canvasWidth,
  canvasHeight,
  options,
  transform,
}: DrawSemanticOverlayParams): void {
  if (!options.showOverlays || !maskImage || imgWidth <= 0 || imgHeight <= 0) {
    return;
  }

  ctx.save();

  // Apply viewport zoom & pan
  ctx.translate(transform.panX, transform.panY);
  ctx.scale(transform.zoom, transform.zoom);

  // Compute resolution scaling
  const scaleX = canvasWidth / imgWidth;
  const scaleY = canvasHeight / imgHeight;
  ctx.scale(scaleX, scaleY);

  // Set alpha blending from options
  ctx.globalAlpha = Math.max(
    0.05,
    Math.min(1.0, options.overlayOpacity ?? 0.6),
  );
  ctx.imageSmoothingEnabled = false; // Preserve crisp pixel boundaries

  // Draw raster mask
  try {
    ctx.drawImage(maskImage, 0, 0, imgWidth, imgHeight);
  } catch (err) {
    console.warn("Failed to render semantic mask overlay:", err);
  }

  ctx.restore();

  // Draw floating legend overlay in top-left if labels are enabled
  if (options.showLabels && colorPalette && colorPalette.length > 0) {
    drawSemanticLegend(ctx, colorPalette, options);
  }
}

/**
 * Draws a high-contrast, dual-encoded legend chip layer on the canvas (R63, R65).
 */
export function drawSemanticLegend(
  ctx: CanvasRenderingContext2D,
  colorPalette: SemanticSegmentationColorMapping[],
  options: ViewerDisplayOptions,
): void {
  ctx.save();
  const chipHeight = 22;
  const startX = 14;
  let startY = 14;

  ctx.font = "bold 11px Inter, sans-serif";
  ctx.textBaseline = "middle";

  for (const item of colorPalette) {
    const isSelected =
      options.selectedClassIds.length === 0 ||
      options.selectedClassIds.includes(item.class_id);

    const safeName = sanitizeText(item.class_name);
    const textWidth = ctx.measureText(safeName).width;
    const chipWidth = textWidth + 36;

    // Draw opaque backdrop chip (R65)
    ctx.fillStyle = isSelected
      ? "rgba(10, 12, 16, 0.90)"
      : "rgba(10, 12, 16, 0.40)";
    ctx.strokeStyle = isSelected ? "#252B37" : "#1A1F29";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(startX, startY, chipWidth, chipHeight, 4);
    ctx.fill();
    ctx.stroke();

    // Draw color swatch
    ctx.fillStyle = item.hex_color || "#22D3EE";
    ctx.beginPath();
    ctx.roundRect(startX + 6, startY + 5, 12, 12, 2);
    ctx.fill();

    // Draw swatch border with high contrast
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw text label
    ctx.fillStyle = isSelected ? "#E8EAED" : "#9AA3B2";
    ctx.fillText(safeName, startX + 24, startY + chipHeight / 2);

    startY += chipHeight + 6;
  }

  ctx.restore();
}
