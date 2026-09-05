import { describe, it, expect } from "vitest";
import {
  getTrackColor,
  getClassColor,
  sanitizeText,
  CATEGORICAL_PALETTE,
} from "./palette";
import { COCO_SKELETON_PAIRS } from "./renderers/pose";
import type {
  DetectionResult,
  ObbResult,
  PoseResult,
  ClassificationResult,
  InstanceSegmentationResult,
} from "@sightforge/contracts";

// Load contract fixtures
import detectionFixture from "../../../contracts/schemas/fixtures/detection.json";
import obbFixture from "../../../contracts/schemas/fixtures/obb.json";
import poseFixture from "../../../contracts/schemas/fixtures/pose.json";
import classificationFixture from "../../../contracts/schemas/fixtures/classification.json";
import instanceSegFixture from "../../../contracts/schemas/fixtures/instance_segmentation.json";
import trackingFixture from "../../../contracts/schemas/fixtures/tracking_detection.json";

describe("Sparse Visualizations - Palette & Utilities (R56, R63, R64, R73, KTD7)", () => {
  it("generates deterministic and stable track colors across track IDs (KTD7)", () => {
    expect(getTrackColor(1)).toBe(
      CATEGORICAL_PALETTE[1 % CATEGORICAL_PALETTE.length],
    );
    expect(getTrackColor(2)).toBe(
      CATEGORICAL_PALETTE[2 % CATEGORICAL_PALETTE.length],
    );
    expect(getTrackColor(10)).toBe(CATEGORICAL_PALETTE[0]);
    // Deterministic replay
    expect(getTrackColor(1)).toBe(getTrackColor(1));
  });

  it("generates deterministic class colors", () => {
    expect(getClassColor(0)).toBe(CATEGORICAL_PALETTE[0]);
    expect(getClassColor(16)).toBe(
      CATEGORICAL_PALETTE[16 % CATEGORICAL_PALETTE.length],
    );
  });

  it("sanitizes untrusted class names and text against XSS (R73)", () => {
    const malicious = "<script>alert('xss')</script> & \"injection\"";
    const sanitized = sanitizeText(malicious);
    expect(sanitized).not.toContain("<script>");
    expect(sanitized).toContain("&lt;script&gt;");
    expect(sanitized).toContain("&amp;");
    expect(sanitized).toContain("&quot;");
  });

  it("validates COCO 17-keypoint skeleton connectivity", () => {
    expect(COCO_SKELETON_PAIRS.length).toBe(16);
    // Every index in pairs is between 0 and 16
    for (const [a, b] of COCO_SKELETON_PAIRS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(16);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(16);
    }
  });
});

describe("Sparse Visualizations - Contract Fixture Compatibility (R55, R56)", () => {
  it("successfully parses detection fixture", () => {
    const doc = detectionFixture as unknown as DetectionResult;
    expect(doc.task).toBe("detection");
    expect(doc.mode).toBe("per-frame");
    const frame = doc.frames?.[0];
    expect(frame?.instances.length).toBe(2);
    expect(frame?.instances[0].class_name).toBe("person");
    expect(frame?.instances[0].box).toEqual([120.5, 85.0, 310.2, 450.8]);
  });

  it("successfully parses OBB fixture with rotated bounding boxes", () => {
    const doc = obbFixture as unknown as ObbResult;
    expect(doc.task).toBe("obb");
    const frame = doc.frames?.[0];
    expect(frame?.instances?.[0]?.rbox).toEqual([
      320.0, 240.0, 180.0, 90.0, 35.5,
    ]);
  });

  it("successfully parses pose fixture with keypoint array", () => {
    const doc = poseFixture as unknown as PoseResult;
    expect(doc.task).toBe("pose");
    const frame = doc.frames?.[0];
    expect(frame?.instances?.[0]?.keypoints?.length).toBe(3);
    expect(frame?.instances?.[0]?.keypoints?.[0]?.name).toBe("nose");
  });

  it("successfully parses classification fixture with ranked predictions", () => {
    const doc = classificationFixture as unknown as ClassificationResult;
    expect(doc.task).toBe("classification");
    const frame = doc.frames?.[0];
    expect(frame?.predictions?.length).toBe(3);
    expect(frame?.predictions?.[0]?.rank).toBe(1);
    expect(frame?.predictions?.[0]?.class_name).toBe("tabby cat");
  });

  it("successfully parses instance segmentation fixture with polygon points", () => {
    const doc = instanceSegFixture as unknown as InstanceSegmentationResult;
    expect(doc.task).toBe("instance-segmentation");
    const frame = doc.frames?.[0];
    expect(frame?.instances?.[0]?.polygon?.length).toBe(4);
    expect(frame?.instances?.[0]?.polygon?.[0]).toEqual([50.0, 60.0]);
  });

  it("successfully parses video tracking fixture with multi-frame tracks", () => {
    const doc = trackingFixture as unknown as DetectionResult;
    expect(doc.task).toBe("detection");
    expect(doc.mode).toBe("tracking");
    expect(doc.tracks?.length).toBe(2);
    expect(doc.tracks?.[0]?.track_id).toBe(1);
    expect(doc.tracks?.[0]?.observations?.length).toBe(2);
  });
});
