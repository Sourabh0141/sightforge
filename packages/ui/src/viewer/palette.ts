/**
 * SightForge UI - Palette & Drawing Utilities (R56, R63, R64, R65, R73, KTD7)
 */

export const CATEGORICAL_PALETTE = [
  "#22D3EE", // Electric Cyan (primary brand)
  "#A78BFA", // Violet (secondary)
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#F43F5E", // Rose
  "#38BDF8", // Sky Blue
  "#A3E635", // Lime
  "#E879F9", // Fuchsia
  "#FB923C", // Orange
  "#2DD4BF", // Teal
] as const;

/**
 * Returns a stable, deterministic color for a given track identifier (R56, KTD7).
 */
export function getTrackColor(trackId: number): string {
  const index = Math.abs(trackId) % CATEGORICAL_PALETTE.length;
  return CATEGORICAL_PALETTE[index] ?? CATEGORICAL_PALETTE[0];
}

/**
 * Returns a stable color for a given class ID.
 */
export function getClassColor(classId: number): string {
  const index = Math.abs(classId) % CATEGORICAL_PALETTE.length;
  return CATEGORICAL_PALETTE[index] ?? CATEGORICAL_PALETTE[0];
}

/**
 * Sanitizes untrusted user/result text against XSS before display (R73).
 */
export function sanitizeText(text: string): string {
  if (typeof text !== "string") return String(text ?? "");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Creates a reusable 16x16 canvas with a 45-degree diagonal line hatch pattern (R63).
 * Allows instance masks to be distinguished by pattern + outline rather than hue alone.
 */
export function createHatchPatternCanvas(
  strokeColor = "rgba(34, 211, 238, 0.45)",
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 16;
  patternCanvas.height = 16;
  const pctx = patternCanvas.getContext("2d");
  if (!pctx) return null;

  pctx.strokeStyle = strokeColor;
  pctx.lineWidth = 2;
  pctx.beginPath();
  // Diagonal lines at 45 degrees
  pctx.moveTo(0, 16);
  pctx.lineTo(16, 0);
  pctx.moveTo(-4, 4);
  pctx.lineTo(4, -4);
  pctx.moveTo(12, 20);
  pctx.lineTo(20, 12);
  pctx.stroke();

  return patternCanvas;
}

/**
 * Draws a pure-black halo beneath a high-visibility light stroke (R64).
 * Arithmetic: Any background failing 3:1 against white exceeds 7:1 against black,
 * guaranteeing an accessible contiguous edge against unknown imagery.
 */
export function drawDoubleStrokeRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  lineWidth = 2,
  isSelected = false,
): void {
  ctx.save();
  // 1. Pure-black halo beneath (4px width)
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = lineWidth + 2;
  ctx.lineJoin = "miter";
  ctx.strokeRect(x, y, w, h);

  // 2. High-visibility light stroke (2px width)
  ctx.strokeStyle = isSelected ? "#22D3EE" : color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, w, h);

  // 3. Selection crosshair corner accents
  if (isSelected) {
    const armLen = Math.min(10, w / 4, h / 4);
    ctx.strokeStyle = "#22D3EE";
    ctx.lineWidth = 2;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(x - 2, y + armLen);
    ctx.lineTo(x - 2, y - 2);
    ctx.lineTo(x + armLen, y - 2);
    // Top-right
    ctx.moveTo(x + w + 2 - armLen, y - 2);
    ctx.lineTo(x + w + 2, y - 2);
    ctx.lineTo(x + w + 2, y + armLen);
    // Bottom-left
    ctx.moveTo(x - 2, y + h + 2 - armLen);
    ctx.lineTo(x - 2, y + h + 2);
    ctx.lineTo(x + armLen, y + h + 2);
    // Bottom-right
    ctx.moveTo(x + w + 2 - armLen, y + h + 2);
    ctx.lineTo(x + w + 2, y + h + 2);
    ctx.lineTo(x + w + 2, y + h + 2 - armLen);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draws an opaque label chip with high-contrast text against a controlled background (R65).
 */
export function drawOpaqueLabelChip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  isSelected = false,
): void {
  ctx.save();
  ctx.font = "500 11px 'JetBrains Mono', monospace";
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const paddingX = 6;
  const chipHeight = 18;
  const chipWidth = textWidth + paddingX * 2;

  // Place chip right above box or inside if too close to top edge
  const chipY = y - chipHeight >= 0 ? y - chipHeight : y;
  const chipX = x;

  // 1. Opaque chip background (#0A0C10 or selected accent)
  ctx.fillStyle = isSelected ? "#22D3EE" : "#0A0C10";
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(chipX, chipY, chipWidth, chipHeight, 3)
    : ctx.rect(chipX, chipY, chipWidth, chipHeight);
  ctx.fill();

  // 2. 1px border for chip definition
  ctx.strokeStyle = isSelected ? "#22D3EE" : color;
  ctx.lineWidth = 1;
  ctx.stroke();

  // 3. Contrast text
  ctx.fillStyle = isSelected ? "#000000" : "#E8EAED";
  ctx.textBaseline = "middle";
  ctx.fillText(text, chipX + paddingX, chipY + chipHeight / 2);

  ctx.restore();
}
