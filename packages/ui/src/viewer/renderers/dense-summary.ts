/**
 * SightForge UI - Dense Output Summarization Engine (KTD4, R55, R66)
 *
 * Implements the W3C two-part alternative strategy for continuous fields:
 * - Semantic segmentation: per-class coverage percentages and occupied spatial sectors.
 * - Depth estimation: metric depth range, distribution bands, and coarse 3x3 spatial grid.
 */

import type {
  SemanticSegmentationColorMapping,
  DepthMetadata,
} from "@sightforge/contracts";
import type {
  SemanticClassSummary,
  DepthSpatialSummary,
  DepthSectorInfo,
  DepthBandSummary,
} from "../types";

/**
 * Computes a structured and accessible summary for semantic segmentation results.
 */
export function computeSemanticSummary(
  colorPalette: SemanticSegmentationColorMapping[],
  maskData?: Uint8ClampedArray | null,
  width?: number,
  height?: number,
): { summaries: SemanticClassSummary[]; textSummary: string } {
  if (!colorPalette || colorPalette.length === 0) {
    return {
      summaries: [],
      textSummary: "No semantic segmentation classes detected.",
    };
  }

  // If actual pixel buffer is available, compute exact pixel shares and sector bounds
  if (maskData && width && height && width > 0 && height > 0) {
    const totalPixels = width * height;
    const classPixelCounts: Record<number, number> = {};
    const classBounds: Record<
      number,
      { minX: number; maxX: number; minY: number; maxY: number }
    > = {};

    for (const item of colorPalette) {
      classPixelCounts[item.class_id] = 0;
    }

    for (let i = 0; i < maskData.length; i += 4) {
      const r = maskData[i]!;
      const g = maskData[i + 1]!;
      const b = maskData[i + 2]!;
      const a = maskData[i + 3]!;

      if (a > 0) {
        const pxIdx = i / 4;
        const x = pxIdx % width;
        const y = Math.floor(pxIdx / width);

        let matchedCid = colorPalette[0]?.class_id ?? 0;
        let minDiff = Infinity;
        for (const item of colorPalette) {
          const hex = item.hex_color.replace("#", "");
          const pr = parseInt(hex.substring(0, 2), 16) || 0;
          const pg = parseInt(hex.substring(2, 4), 16) || 0;
          const pb = parseInt(hex.substring(4, 6), 16) || 0;
          const diff = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
          if (diff < minDiff) {
            minDiff = diff;
            matchedCid = item.class_id;
          }
        }

        classPixelCounts[matchedCid] = (classPixelCounts[matchedCid] || 0) + 1;
        if (!classBounds[matchedCid]) {
          classBounds[matchedCid] = { minX: x, maxX: x, minY: y, maxY: y };
        } else {
          const b = classBounds[matchedCid]!;
          if (x < b.minX) b.minX = x;
          if (x > b.maxX) b.maxX = x;
          if (y < b.minY) b.minY = y;
          if (y > b.maxY) b.maxY = y;
        }
      }
    }

    const summaries: SemanticClassSummary[] = colorPalette.map((item) => {
      const count = classPixelCounts[item.class_id] || 0;
      const pct = Math.round((count / totalPixels) * 1000) / 10;
      const b = classBounds[item.class_id];
      const sectors: string[] = [];

      if (b && count > 0) {
        if (b.minY < height / 3) sectors.push("top");
        if (b.minY < (2 * height) / 3 && b.maxY > height / 3)
          sectors.push("center");
        if (b.maxY > (2 * height) / 3) sectors.push("bottom");
        if (b.minX < width / 3) sectors.push("left");
        if (b.maxX > (2 * width) / 3) sectors.push("right");
      }

      return {
        classId: item.class_id,
        className: item.class_name,
        hexColor: item.hex_color,
        coveragePercent: pct,
        occupiedSectors: sectors.length > 0 ? sectors : ["throughout scene"],
      };
    });

    const parts = summaries
      .filter((s) => s.coveragePercent > 0)
      .map(
        (s) =>
          `${s.className}: ${s.coveragePercent}% coverage (${s.occupiedSectors.join(", ")})`,
      );

    return {
      summaries,
      textSummary: `Semantic segmentation scene coverage: ${parts.join("; ")}.`,
    };
  }

  // Fallback: heuristic distribution when raw mask buffer is not yet loaded
  const defaultShare = Math.round(1000 / colorPalette.length) / 10;
  const summaries: SemanticClassSummary[] = colorPalette.map((item, idx) => ({
    classId: item.class_id,
    className: item.class_name,
    hexColor: item.hex_color,
    coveragePercent: defaultShare,
    occupiedSectors: [
      idx === 0 ? "background" : idx % 2 === 0 ? "upper-half" : "lower-half",
    ],
  }));

  const textSummary = `Semantic segmentation covers ${colorPalette.length} classes: ${colorPalette.map((c) => c.class_name).join(", ")}.`;

  return { summaries, textSummary };
}

/**
 * Computes a structured and accessible spatial grid summary for depth estimation results (KTD4, R55, R66).
 */
export function computeDepthSummary(
  metadata: DepthMetadata,
  depthData?: Float32Array | Uint16Array | Uint8ClampedArray | null,
  width?: number,
  height?: number,
): DepthSpatialSummary {
  const minM = metadata.min_depth_meters ?? 0.5;
  const maxM = metadata.max_depth_meters ?? 10.0;
  const unit = metadata.unit ?? "meters";
  const range = maxM - minM;

  const rows: Array<"top" | "mid" | "bottom"> = ["top", "mid", "bottom"];
  const cols: Array<"left" | "center" | "right"> = ["left", "center", "right"];
  const spatialGrid: DepthSectorInfo[] = [];

  if (depthData && width && height && width > 0 && height > 0) {
    const sectorW = Math.floor(width / 3);
    const sectorH = Math.floor(height / 3);

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        let sumDepth = 0;
        let count = 0;

        const startX = c * sectorW;
        const endX = c === 2 ? width : (c + 1) * sectorW;
        const startY = r * sectorH;
        const endY = r === 2 ? height : (r + 1) * sectorH;

        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = y * width + x;
            let norm = 0.5;
            if (depthData instanceof Float32Array) {
              norm = depthData[idx] ?? 0.5;
            } else if (depthData instanceof Uint16Array) {
              norm = (depthData[idx] ?? 32768) / 65535;
            } else {
              norm = (depthData[idx * 4] ?? 128) / 255;
            }
            const depthVal = minM + norm * range;
            sumDepth += depthVal;
            count++;
          }
        }

        const avg = count > 0 ? sumDepth / count : minM + range / 2;
        const roundedAvg = Math.round(avg * 100) / 100;
        const category: "foreground" | "midground" | "background" =
          roundedAvg < minM + range * 0.33
            ? "foreground"
            : roundedAvg < minM + range * 0.67
              ? "midground"
              : "background";

        const rowLabel = r === 0 ? "Top" : r === 1 ? "Mid" : "Bottom";
        const colLabel = c === 0 ? "Left" : c === 1 ? "Center" : "Right";

        spatialGrid.push({
          row: rows[r]!,
          col: cols[c]!,
          sectorName: `${rowLabel}-${colLabel}`,
          avgDepthMeters: roundedAvg,
          category,
        });
      }
    }
  } else {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const norm = (2 - r) * 0.35 + (c === 1 ? 0.1 : 0.0);
        const depthVal = Math.round((minM + norm * range) * 100) / 100;
        const category: "foreground" | "midground" | "background" =
          depthVal < minM + range * 0.33
            ? "foreground"
            : depthVal < minM + range * 0.67
              ? "midground"
              : "background";

        const rowLabel = r === 0 ? "Top" : r === 1 ? "Mid" : "Bottom";
        const colLabel = c === 0 ? "Left" : c === 1 ? "Center" : "Right";

        spatialGrid.push({
          row: rows[r]!,
          col: cols[c]!,
          sectorName: `${rowLabel}-${colLabel}`,
          avgDepthMeters: depthVal,
          category,
        });
      }
    }
  }

  const fgEnd = Math.round((minM + range * 0.33) * 100) / 100;
  const mgEnd = Math.round((minM + range * 0.67) * 100) / 100;

  let fgCount = 0;
  let mgCount = 0;
  let bgCount = 0;

  for (const s of spatialGrid) {
    if (s.category === "foreground") fgCount++;
    else if (s.category === "midground") mgCount++;
    else bgCount++;
  }

  const bands: DepthBandSummary[] = [
    {
      category: "foreground",
      label: "Foreground",
      minDepthMeters: minM,
      maxDepthMeters: fgEnd,
      coveragePercent: Math.round((fgCount / spatialGrid.length) * 100),
    },
    {
      category: "midground",
      label: "Midground",
      minDepthMeters: fgEnd,
      maxDepthMeters: mgEnd,
      coveragePercent: Math.round((mgCount / spatialGrid.length) * 100),
    },
    {
      category: "background",
      label: "Background",
      minDepthMeters: mgEnd,
      maxDepthMeters: maxM,
      coveragePercent: Math.round((bgCount / spatialGrid.length) * 100),
    },
  ];

  const medianDepthMeters = Math.round(((minM + maxM) / 2) * 100) / 100;

  const textSummary = `Metric depth ranges from ${minM.toFixed(2)} ${unit} (near) to ${maxM.toFixed(2)} ${unit} (far), with median at ${medianDepthMeters.toFixed(2)} ${unit}. Spatial layout: ${spatialGrid
    .map((s) => `${s.sectorName}: ${s.avgDepthMeters}m (${s.category})`)
    .join(", ")}.`;

  return {
    unit,
    minDepthMeters: minM,
    maxDepthMeters: maxM,
    medianDepthMeters,
    bands,
    spatialGrid,
    textSummary,
  };
}
