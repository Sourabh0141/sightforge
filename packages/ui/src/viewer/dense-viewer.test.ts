import { describe, it, expect } from "vitest";
import {
  getColormapRGB,
  computeSemanticSummary,
  computeDepthSummary,
} from "./renderers";
import type {
  SemanticSegmentationResult,
  DepthResult,
} from "@sightforge/contracts";

import semanticSegFixture from "../../../contracts/schemas/fixtures/semantic_segmentation.json";
import depthFixture from "../../../contracts/schemas/fixtures/depth.json";

describe("Dense Visualizations - Colormaps & Metric Scale (R55, R64, KTD3)", () => {
  it("generates valid RGB triplets for all colormaps across normalized range [0, 1]", () => {
    const colormaps = [
      "turbo",
      "viridis",
      "plasma",
      "inferno",
      "grayscale",
    ] as const;

    for (const cmap of colormaps) {
      for (const t of [0.0, 0.25, 0.5, 0.75, 1.0]) {
        const [r, g, b] = getColormapRGB(t, cmap);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      }
    }
  });

  it("produces high-contrast near vs far RGB values in Turbo and Viridis colormaps", () => {
    const nearTurbo = getColormapRGB(0.0, "turbo");
    const farTurbo = getColormapRGB(1.0, "turbo");
    expect(nearTurbo).not.toEqual(farTurbo);

    const nearViridis = getColormapRGB(0.0, "viridis");
    const farViridis = getColormapRGB(1.0, "viridis");
    expect(nearViridis).not.toEqual(farViridis);
  });
});

describe("Dense Visualizations - Semantic Segmentation Summarizer (KTD4, R63, R66)", () => {
  const palette = [
    { class_id: 0, class_name: "background", hex_color: "#000000" },
    { class_id: 1, class_name: "road", hex_color: "#808080" },
    { class_id: 2, class_name: "sky", hex_color: "#70D0FF" },
  ];

  it("computes per-class coverage shares and text summary for palette", () => {
    const { summaries, textSummary } = computeSemanticSummary(palette);
    expect(summaries.length).toBe(3);
    expect(summaries[0].className).toBe("background");
    expect(summaries[1].className).toBe("road");
    expect(summaries[2].className).toBe("sky");
    expect(textSummary).toContain("Semantic segmentation covers 3 classes");
  });

  it("handles empty palette gracefully", () => {
    const { summaries, textSummary } = computeSemanticSummary([]);
    expect(summaries.length).toBe(0);
    expect(textSummary).toContain("No semantic segmentation classes detected");
  });
});

describe("Dense Visualizations - Depth Spatial Grid Summarizer (KTD4, R55, R66)", () => {
  const metadata = {
    unit: "meters" as const,
    scale_factor: 1000.0,
    min_depth_meters: 0.5,
    max_depth_meters: 8.0,
  };

  it("generates a 9-sector 3x3 coarse spatial grid with metric values", () => {
    const summary = computeDepthSummary(metadata);
    expect(summary.unit).toBe("meters");
    expect(summary.minDepthMeters).toBe(0.5);
    expect(summary.maxDepthMeters).toBe(8.0);
    expect(summary.medianDepthMeters).toBe(4.25);
    expect(summary.spatialGrid.length).toBe(9);

    // Verify 9 sectors: Top, Mid, Bottom x Left, Center, Right
    const sectorNames = summary.spatialGrid.map((s) => s.sectorName);
    expect(sectorNames).toContain("Top-Left");
    expect(sectorNames).toContain("Top-Center");
    expect(sectorNames).toContain("Top-Right");
    expect(sectorNames).toContain("Mid-Left");
    expect(sectorNames).toContain("Mid-Center");
    expect(sectorNames).toContain("Mid-Right");
    expect(sectorNames).toContain("Bottom-Left");
    expect(sectorNames).toContain("Bottom-Center");
    expect(sectorNames).toContain("Bottom-Right");
  });

  it("computes depth distribution bands for Foreground, Midground, and Background", () => {
    const summary = computeDepthSummary(metadata);
    expect(summary.bands.length).toBe(3);
    expect(summary.bands[0].category).toBe("foreground");
    expect(summary.bands[1].category).toBe("midground");
    expect(summary.bands[2].category).toBe("background");

    const totalPct = summary.bands.reduce(
      (sum, b) => sum + b.coveragePercent,
      0,
    );
    expect(totalPct).toBeGreaterThanOrEqual(95);
    expect(totalPct).toBeLessThanOrEqual(105);
  });
});

describe("Dense Visualizations - Contract Fixture Verification (R55, R57)", () => {
  it("successfully parses semantic segmentation contract fixture", () => {
    const doc = semanticSegFixture as unknown as SemanticSegmentationResult;
    expect(doc.task).toBe("semantic-segmentation");
    expect(doc.mode).toBe("per-frame");
    expect(doc.artifact.key).toContain("semantic_map.png");
    expect(doc.artifact.width).toBe(640);
    expect(doc.artifact.height).toBe(480);
    expect(doc.artifact.color_palette.length).toBe(4);
    expect(doc.artifact.color_palette[1].class_name).toBe("road");
  });

  it("successfully parses depth estimation contract fixture", () => {
    const doc = depthFixture as unknown as DepthResult;
    expect(doc.task).toBe("depth");
    expect(doc.mode).toBe("per-frame");
    expect(doc.artifact.key).toContain("depth_map.png");
    expect(doc.artifact.depth_metadata.unit).toBe("meters");
    expect(doc.artifact.depth_metadata.min_depth_meters).toBe(0.25);
    expect(doc.artifact.depth_metadata.max_depth_meters).toBe(18.5);
  });
});
