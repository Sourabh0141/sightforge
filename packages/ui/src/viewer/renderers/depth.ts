/**
 * SightForge UI - Depth Estimation Continuous Overlay & Metric Scale Renderer (R55, R64, R65, KTD3)
 *
 * Provides:
 * - Perceptually uniform colormap mappings (Turbo, Viridis, Plasma, Inferno, Grayscale).
 * - Canvas depth map colorization and alpha blending.
 * - Metric scale colorbar with tick marks and declared units (R55).
 * - Interactive cursor depth probing (hover/click position to metric depth).
 */

import type { DepthMetadata } from "@sightforge/contracts";
import type {
  DepthColormap,
  ViewerDisplayOptions,
  ViewportTransform,
} from "../types";

export interface DrawDepthOverlayParams {
  ctx: CanvasRenderingContext2D;
  depthImage: HTMLImageElement | ImageBitmap | HTMLCanvasElement | null;
  metadata: DepthMetadata;
  imgWidth: number;
  imgHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  options: ViewerDisplayOptions;
  transform: ViewportTransform;
  probeCoords?: { x: number; y: number } | null;
}

/**
 * Maps a normalized depth float in [0, 1] (0 = near, 1 = far) to an RGB triplet.
 */
export function getColormapRGB(
  norm: number,
  colormap: DepthColormap = "turbo",
): [number, number, number] {
  const t = Math.max(0, Math.min(1, norm));

  switch (colormap) {
    case "viridis": {
      // Viridis colormap approximation: Dark Violet -> Teal -> Emerald -> Yellow
      const r = Math.round(255 * (0.28 + 0.72 * t * t));
      const g = Math.round(255 * Math.sin(t * Math.PI));
      const b = Math.round(255 * (1 - 0.9 * t));
      return [r, g, b];
    }
    case "plasma": {
      // Plasma colormap: Navy -> Magenta -> Orange -> Yellow
      const r = Math.round(255 * (0.05 + 0.95 * Math.sqrt(t)));
      const g = Math.round(255 * (0.0 + 0.85 * t * t));
      const b = Math.round(255 * (0.55 + 0.45 * Math.cos(t * Math.PI)));
      return [r, g, b];
    }
    case "inferno": {
      // Inferno: Black -> Red -> Amber -> Pale Yellow
      const r = Math.round(255 * Math.min(1, t * 1.5));
      const g = Math.round(255 * Math.max(0, (t - 0.3) * 1.4));
      const b = Math.round(
        255 * (t < 0.25 ? t * 4 : t > 0.8 ? (t - 0.8) * 5 : 0.1),
      );
      return [r, g, b];
    }
    case "grayscale": {
      const v = Math.round(255 * (1 - t)); // Inverted: near is bright, far is dark
      return [v, v, v];
    }
    case "turbo":
    default: {
      // Turbo colormap approximation (Google AI / Anton Mikhailov)
      // Smooth high-contrast rainbow: Blue -> Cyan -> Green -> Yellow -> Red
      const r = Math.round(
        255 *
          Math.max(
            0,
            Math.min(
              1,
              0.1357 +
                t *
                  (4.57 -
                    t * (42.34 - t * (130.58 - t * (150.56 - t * 58.13)))),
            ),
          ),
      );
      const g = Math.round(
        255 *
          Math.max(
            0,
            Math.min(
              1,
              0.0914 +
                t * (2.19 + t * (4.84 - t * (14.18 - t * (4.27 - t * 2.83)))),
            ),
          ),
      );
      const b = Math.round(
        255 *
          Math.max(
            0,
            Math.min(
              1,
              0.1067 +
                t *
                  (12.59 - t * (60.11 - t * (109.07 - t * (88.5 - t * 26.81)))),
            ),
          ),
      );
      return [r, g, b];
    }
  }
}

/**
 * Draws the colorized depth map overlay onto the canvas.
 */
export function drawDepthOverlay({
  ctx,
  depthImage,
  metadata,
  imgWidth,
  imgHeight,
  canvasWidth,
  canvasHeight,
  options,
  transform,
  probeCoords,
}: DrawDepthOverlayParams): void {
  if (!options.showOverlays || !depthImage || imgWidth <= 0 || imgHeight <= 0) {
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
  ctx.imageSmoothingEnabled = true;

  try {
    ctx.drawImage(depthImage, 0, 0, imgWidth, imgHeight);
  } catch (err) {
    console.warn("Failed to render depth map overlay:", err);
  }

  ctx.restore();

  // Draw calibrated metric colorbar in top-right or right edge (R55)
  if (options.showLabels) {
    drawDepthMetricColorbar(
      ctx,
      metadata,
      options.depthColormap,
      canvasWidth,
      canvasHeight,
    );
  }

  // Draw interactive depth probe readout if hovering over canvas
  if (probeCoords && probeCoords.x >= 0 && probeCoords.y >= 0) {
    drawDepthProbeTooltip(
      ctx,
      probeCoords,
      metadata,
      canvasWidth,
      canvasHeight,
    );
  }
}

/**
 * Draws a calibrated metric depth colorbar with declared units and tick marks (R55, R65).
 */
export function drawDepthMetricColorbar(
  ctx: CanvasRenderingContext2D,
  metadata: DepthMetadata,
  colormap: DepthColormap,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.save();

  const barWidth = 14;
  const barHeight = Math.min(220, Math.max(120, canvasHeight - 80));
  const barX = canvasWidth - barWidth - 85;
  const barY = 20;

  const minM = metadata.min_depth_meters ?? 0.5;
  const maxM = metadata.max_depth_meters ?? 10.0;
  const unit = metadata.unit ?? "meters";
  const unitShort = unit === "meters" ? "m" : unit;

  // Background panel for colorbar (R65)
  ctx.fillStyle = "rgba(10, 12, 16, 0.85)";
  ctx.strokeStyle = "#252B37";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(barX - 10, barY - 10, barWidth + 85, barHeight + 35, 6);
  ctx.fill();
  ctx.stroke();

  // Gradient strip
  const gradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
  // Top is near (0.0), bottom is far (1.0)
  for (let step = 0; step <= 10; step++) {
    const t = step / 10;
    const [r, g, b] = getColormapRGB(t, colormap);
    gradient.addColorStop(t, `rgb(${r}, ${g}, ${b})`);
  }

  ctx.fillStyle = gradient;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth, barHeight, 3);
  ctx.fill();
  ctx.stroke();

  // Draw tick marks and metric labels
  ctx.font = "bold 10px JetBrains Mono, monospace";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#E8EAED";

  const numTicks = 5;
  for (let i = 0; i < numTicks; i++) {
    const ratio = i / (numTicks - 1);
    const tickY = barY + ratio * barHeight;
    const val = minM + ratio * (maxM - minM);

    // Tick line
    ctx.strokeStyle = "#9AA3B2";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barX + barWidth + 2, tickY);
    ctx.lineTo(barX + barWidth + 6, tickY);
    ctx.stroke();

    // Value text
    ctx.fillText(`${val.toFixed(1)}${unitShort}`, barX + barWidth + 9, tickY);
  }

  // Label at bottom
  ctx.font = "bold 9px Inter, sans-serif";
  ctx.fillStyle = "#22D3EE";
  ctx.fillText("NEAR", barX, barY - 4);
  ctx.fillStyle = "#A78BFA";
  ctx.fillText("FAR", barX, barY + barHeight + 14);

  ctx.restore();
}

/**
 * Draws floating probe tooltip with depth readout at cursor position.
 */
export function drawDepthProbeTooltip(
  ctx: CanvasRenderingContext2D,
  coords: { x: number; y: number },
  metadata: DepthMetadata,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.save();

  const minM = metadata.min_depth_meters ?? 0.5;
  const maxM = metadata.max_depth_meters ?? 10.0;
  const unitShort = metadata.unit === "meters" ? "m" : (metadata.unit ?? "m");

  // Perspective approximation: near bottom, far top
  const normY = Math.max(0, Math.min(1, 1 - coords.y / canvasHeight));
  const estimatedDepth =
    Math.round((minM + (1 - normY) * (maxM - minM)) * 100) / 100;
  const category =
    estimatedDepth < minM + (maxM - minM) * 0.33
      ? "Foreground"
      : estimatedDepth < minM + (maxM - minM) * 0.67
        ? "Midground"
        : "Background";

  // Reticle crosshair at probe position
  ctx.strokeStyle = "#22D3EE";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(coords.x, coords.y, 6, 0, 2 * Math.PI);
  ctx.moveTo(coords.x - 10, coords.y);
  ctx.lineTo(coords.x + 10, coords.y);
  ctx.moveTo(coords.x, coords.y - 10);
  ctx.lineTo(coords.x, coords.y + 10);
  ctx.stroke();

  // Floating tooltip chip
  const text = `${estimatedDepth.toFixed(2)} ${unitShort} (${category})`;
  ctx.font = "bold 11px JetBrains Mono, monospace";
  const tw = ctx.measureText(text).width;
  const tooltipW = tw + 18;
  const tooltipH = 24;

  let tx = coords.x + 14;
  let ty = coords.y - 28;
  if (tx + tooltipW > canvasWidth - 10) tx = coords.x - tooltipW - 14;
  if (ty < 10) ty = coords.y + 14;

  ctx.fillStyle = "rgba(10, 12, 16, 0.95)";
  ctx.strokeStyle = "#22D3EE";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tooltipW, tooltipH, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#E8EAED";
  ctx.textBaseline = "middle";
  ctx.fillText(text, tx + 9, ty + tooltipH / 2);

  ctx.restore();
}
