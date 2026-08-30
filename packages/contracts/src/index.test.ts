import { describe, expect, it } from "vitest";
import defaultsConfig from "../../../config/defaults.json";
import classificationFixture from "../schemas/fixtures/classification.json";
import depthFixture from "../schemas/fixtures/depth.json";
import detectionFixture from "../schemas/fixtures/detection.json";
import instanceSegFixture from "../schemas/fixtures/instance_segmentation.json";
import obbFixture from "../schemas/fixtures/obb.json";
import poseFixture from "../schemas/fixtures/pose.json";
import semanticSegFixture from "../schemas/fixtures/semantic_segmentation.json";
import trackingDetectionFixture from "../schemas/fixtures/tracking_detection.json";
import {
  SIGHTFORGE_CONTRACT_VERSION,
  validateDefaultsConfig,
  validateResultDocument,
} from "./index";

describe("@sightforge/contracts - Version", () => {
  it("exports contract version matching 1.0.0 per R51", () => {
    expect(SIGHTFORGE_CONTRACT_VERSION).toBe("1.0.0");
  });
});

describe("@sightforge/contracts - Positive Fixture Validation", () => {
  const fixtures: Record<string, unknown> = {
    "detection.json": detectionFixture,
    "instance_segmentation.json": instanceSegFixture,
    "pose.json": poseFixture,
    "obb.json": obbFixture,
    "classification.json": classificationFixture,
    "semantic_segmentation.json": semanticSegFixture,
    "depth.json": depthFixture,
    "tracking_detection.json": trackingDetectionFixture,
  };

  for (const [fixtureName, fixtureData] of Object.entries(fixtures)) {
    it(`validates fixture: ${fixtureName}`, () => {
      const res = validateResultDocument(fixtureData);
      expect(
        res.valid,
        `Fixture ${fixtureName} failed validation: ${res.errors?.join(", ")}`,
      ).toBe(true);
    });
  }

  it("validates config/defaults.json against defaults schema per R78", () => {
    const res = validateDefaultsConfig(defaultsConfig);
    expect(
      res.valid,
      `defaults.json failed validation: ${res.errors?.join(", ")}`,
    ).toBe(true);
  });
});

describe("@sightforge/contracts - Negative Fixture Validation", () => {
  it("rejects document missing schema_version per R51", () => {
    const invalidDoc = { ...detectionFixture } as Record<string, unknown>;
    delete invalidDoc.schema_version;
    const res = validateResultDocument(invalidDoc);
    expect(res.valid).toBe(false);
  });

  it("rejects document missing task discriminator", () => {
    const invalidDoc = { ...detectionFixture } as Record<string, unknown>;
    delete invalidDoc.task;
    const res = validateResultDocument(invalidDoc);
    expect(res.valid).toBe(false);
  });

  it("rejects document with mismatched task and payload (detection with depth artifact)", () => {
    const mismatched = { ...depthFixture, task: "detection" };
    const res = validateResultDocument(mismatched);
    expect(res.valid).toBe(false);
  });

  it("rejects tracking mode on classification result per R43", () => {
    const invalidTracking = {
      ...classificationFixture,
      mode: "tracking",
      tracks: [
        {
          track_id: 1,
          class_id: 0,
          class_name: "test",
          confidence_avg: 0.9,
          observations: [],
        },
      ],
    };
    const res = validateResultDocument(invalidTracking);
    expect(res.valid).toBe(false);
  });

  it("rejects tracking mode on depth result per R43", () => {
    const invalidTracking = {
      ...depthFixture,
      mode: "tracking",
      tracks: [
        {
          track_id: 1,
          class_id: 0,
          class_name: "test",
          confidence_avg: 0.9,
          observations: [],
        },
      ],
    };
    const res = validateResultDocument(invalidTracking);
    expect(res.valid).toBe(false);
  });

  it("rejects inline pixel arrays on semantic-segmentation per KTD11", () => {
    const invalidSemantic = {
      schema_version: "1.0.0",
      job_id: "job_invalid",
      task: "semantic-segmentation",
      model_variant: "yolo26n",
      mode: "per-frame",
      media_type: "image",
      summary: {
        source_fps: 0,
        sampled_fps: 0,
        frames_processed: 1,
        duration_ms: 0,
        inference_duration_ms: 10,
        cold_start_duration_ms: 0,
      },
      pixels: [
        [0, 1, 2],
        [1, 2, 0],
      ],
    };
    const res = validateResultDocument(invalidSemantic);
    expect(res.valid).toBe(false);
  });

  it("rejects semantic-segmentation artifact missing object key", () => {
    const invalidArtifact = {
      ...semanticSegFixture,
      artifact: { ...semanticSegFixture.artifact },
    } as Record<string, unknown>;
    delete (invalidArtifact.artifact as Record<string, unknown>).key;
    const res = validateResultDocument(invalidArtifact);
    expect(res.valid).toBe(false);
  });
});
