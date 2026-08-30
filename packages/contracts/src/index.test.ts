import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SIGHTFORGE_CONTRACT_VERSION,
  validateDefaultsConfig,
  validateResultDocument,
} from "./index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const fixturesDir = path.join(rootDir, "schemas", "fixtures");
const defaultsConfigPath = path.resolve(
  rootDir,
  "..",
  "..",
  "config",
  "defaults.json",
);

describe("@sightforge/contracts - Version", () => {
  it("exports contract version matching 1.0.0 per R51", () => {
    expect(SIGHTFORGE_CONTRACT_VERSION).toBe("1.0.0");
  });
});

describe("@sightforge/contracts - Positive Fixture Validation", () => {
  const fixtures = [
    "detection.json",
    "instance_segmentation.json",
    "pose.json",
    "obb.json",
    "classification.json",
    "semantic_segmentation.json",
    "depth.json",
    "tracking_detection.json",
  ];

  for (const fixtureName of fixtures) {
    it(`validates fixture: ${fixtureName}`, () => {
      const fixturePath = path.join(fixturesDir, fixtureName);
      const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
      const res = validateResultDocument(data);
      expect(
        res.valid,
        `Fixture ${fixtureName} failed validation: ${res.errors?.join(", ")}`,
      ).toBe(true);
    });
  }

  it("validates config/defaults.json against defaults schema per R78", () => {
    const defaultsData = JSON.parse(
      fs.readFileSync(defaultsConfigPath, "utf-8"),
    );
    const res = validateDefaultsConfig(defaultsData);
    expect(
      res.valid,
      `defaults.json failed validation: ${res.errors?.join(", ")}`,
    ).toBe(true);
  });
});

describe("@sightforge/contracts - Negative Fixture Validation", () => {
  it("rejects document missing schema_version per R51", () => {
    const detectionFixture = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "detection.json"), "utf-8"),
    );
    delete detectionFixture.schema_version;
    const res = validateResultDocument(detectionFixture);
    expect(res.valid).toBe(false);
  });

  it("rejects document missing task discriminator", () => {
    const detectionFixture = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "detection.json"), "utf-8"),
    );
    delete detectionFixture.task;
    const res = validateResultDocument(detectionFixture);
    expect(res.valid).toBe(false);
  });

  it("rejects document with mismatched task and payload (detection with depth artifact)", () => {
    const depthFixture = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "depth.json"), "utf-8"),
    );
    const mismatched = { ...depthFixture, task: "detection" };
    const res = validateResultDocument(mismatched);
    expect(res.valid).toBe(false);
  });

  it("rejects tracking mode on classification result per R43", () => {
    const classificationFixture = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "classification.json"), "utf-8"),
    );
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
    const depthFixture = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "depth.json"), "utf-8"),
    );
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
    const semanticFixture = JSON.parse(
      fs.readFileSync(
        path.join(fixturesDir, "semantic_segmentation.json"),
        "utf-8",
      ),
    );
    delete semanticFixture.artifact.key;
    const res = validateResultDocument(semanticFixture);
    expect(res.valid).toBe(false);
  });
});
