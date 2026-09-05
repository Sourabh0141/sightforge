import { describe, it, expect } from "vitest";
import {
  GALLERY_ORDER,
  GALLERY_TASK_MAP,
  getAdjacentGalleryTasks,
  getGalleryStaticParams,
} from "../../lib/gallery-fixtures";

describe("Public Demo Gallery (Plan 4 Unit 6 - R116, R54, KTD2)", () => {
  it("provides static params for all eight gallery task slugs", async () => {
    const params = getGalleryStaticParams();
    expect(params).toHaveLength(8);
    const slugs = params.map((p) => p.task);
    expect(slugs).toEqual([
      "detection",
      "instance-segmentation",
      "semantic-segmentation",
      "classification",
      "pose",
      "obb",
      "depth",
      "tracking",
    ]);
  });

  it("contains complete metadata for each gallery entry", () => {
    expect(GALLERY_ORDER).toHaveLength(8);

    for (const slug of GALLERY_ORDER) {
      const entry = GALLERY_TASK_MAP[slug];
      expect(entry).toBeDefined();
      expect(entry?.slug).toBe(slug);
      expect(entry?.title).toBeTruthy();
      expect(entry?.shortDesc).toBeTruthy();
      expect(entry?.explainer).toBeTruthy();
      expect(entry?.mediaUrl).toMatch(/^\/assets\/visual-.*\.png$/);
      expect(entry?.document).toBeDefined();
      expect(entry?.document.schema_version).toBe("1.0.0");
      expect(entry?.highlights.length).toBeGreaterThan(0);
    }
  });

  it("provides valid schema structures for all vision task fixtures", () => {
    // Object Detection
    const detection = GALLERY_TASK_MAP["detection"]?.document as any;
    expect(detection?.task).toBe("detection");
    expect(detection?.frames?.[0]?.instances?.length).toBeGreaterThan(0);

    // Instance Segmentation
    const instanceSeg = GALLERY_TASK_MAP["instance-segmentation"]
      ?.document as any;
    expect(instanceSeg?.task).toBe("instance-segmentation");
    expect(instanceSeg?.frames?.[0]?.instances?.[0]?.polygon).toBeDefined();

    // Semantic Segmentation
    const semanticSeg = GALLERY_TASK_MAP["semantic-segmentation"]
      ?.document as any;
    expect(semanticSeg?.task).toBe("semantic-segmentation");
    expect(semanticSeg?.artifact?.color_palette?.length).toBeGreaterThan(0);
    expect(
      GALLERY_TASK_MAP["semantic-segmentation"]?.artifactDataUrl,
    ).toBeDefined();

    // Classification
    const classification = GALLERY_TASK_MAP["classification"]?.document as any;
    expect(classification?.task).toBe("classification");
    expect(classification?.frames?.[0]?.predictions?.length).toBeGreaterThan(0);

    // Pose Estimation
    const pose = GALLERY_TASK_MAP["pose"]?.document as any;
    expect(pose?.task).toBe("pose");
    expect(
      pose?.frames?.[0]?.instances?.[0]?.keypoints?.length,
    ).toBeGreaterThan(0);

    // Oriented Bounding Box
    const obb = GALLERY_TASK_MAP["obb"]?.document as any;
    expect(obb?.task).toBe("obb");
    expect(obb?.frames?.[0]?.instances?.[0]?.rbox?.length).toBe(5);

    // Depth Estimation
    const depth = GALLERY_TASK_MAP["depth"]?.document as any;
    expect(depth?.task).toBe("depth");
    expect(depth?.artifact?.depth_metadata?.unit).toBe("meters");
    expect(GALLERY_TASK_MAP["depth"]?.artifactDataUrl).toBeDefined();

    // Video Object Tracking
    const tracking = GALLERY_TASK_MAP["tracking"]?.document as any;
    expect(tracking?.mode).toBe("tracking");
    expect(tracking?.tracks?.length).toBeGreaterThan(0);
  });

  it("cycles adjacent tasks correctly in both directions", () => {
    const first = getAdjacentGalleryTasks("detection");
    expect(first.prev.slug).toBe("tracking");
    expect(first.next.slug).toBe("instance-segmentation");

    const middle = getAdjacentGalleryTasks("classification");
    expect(middle.prev.slug).toBe("semantic-segmentation");
    expect(middle.next.slug).toBe("pose");

    const last = getAdjacentGalleryTasks("tracking");
    expect(last.prev.slug).toBe("depth");
    expect(last.next.slug).toBe("detection");
  });
});
