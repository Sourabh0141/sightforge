/**
 * SightForge UI - Video Tracking Trajectory & Motion Trail Renderer (R56, R63, R64, KTD7)
 */

import type { NormalizedRegion, ViewerDisplayOptions } from "../types";
import { getTrackColor } from "../palette";

export function renderTrackingTrajectory(
  ctx: CanvasRenderingContext2D,
  region: NormalizedRegion,
  currentFrameIndex: number,
  options: ViewerDisplayOptions,
  isSelected: boolean,
  _isHovered: boolean,
  isDimmed: boolean,
): void {
  if (
    !options.showTracks ||
    !region.trajectory ||
    region.trajectory.length < 2
  ) {
    return;
  }

  const trackId = region.trackId ?? 1;
  const color = getTrackColor(trackId);

  // Filter trajectory up to current frame index
  const visiblePoints = region.trajectory.filter(
    (p) => p.frameIndex <= currentFrameIndex,
  );
  if (visiblePoints.length < 2) return;

  const firstPt = visiblePoints[0];
  if (!firstPt) return;

  ctx.save();
  if (isDimmed) {
    ctx.globalAlpha = 0.2;
  }

  // 1. Black halo for trajectory line (R64)
  ctx.beginPath();
  ctx.moveTo(firstPt.x, firstPt.y);
  for (let i = 1; i < visiblePoints.length; i++) {
    const pt = visiblePoints[i];
    if (pt) {
      ctx.lineTo(pt.x, pt.y);
    }
  }
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = isSelected ? 4 : 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // 2. Colored dashed motion trail (R56, R63)
  ctx.beginPath();
  ctx.moveTo(firstPt.x, firstPt.y);
  for (let i = 1; i < visiblePoints.length; i++) {
    const pt = visiblePoints[i];
    if (pt) {
      ctx.lineTo(pt.x, pt.y);
    }
  }
  ctx.strokeStyle = isSelected ? "#22D3EE" : color;
  ctx.lineWidth = isSelected ? 2 : 1.5;
  ctx.setLineDash([4, 3]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // 3. Small waypoint dots along trajectory
  for (let i = 0; i < visiblePoints.length; i++) {
    const pt = visiblePoints[i];
    if (!pt) continue;
    const isCurrent = i === visiblePoints.length - 1;
    const radius = isCurrent ? 3 : 2;

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius + 1, 0, 2 * Math.PI);
    ctx.fillStyle = "#000000";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = isCurrent ? "#22D3EE" : color;
    ctx.fill();
  }

  ctx.restore();
}
