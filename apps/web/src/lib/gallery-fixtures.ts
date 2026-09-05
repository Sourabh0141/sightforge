/**
 * SightForge Web - Gallery Result Fixtures & Task Descriptions (R55, R56, R116)
 */

import type { SightForgeResultDocument } from "@sightforge/contracts";

import detectionFixture from "../../../../packages/contracts/schemas/fixtures/detection.json";
import obbFixture from "../../../../packages/contracts/schemas/fixtures/obb.json";
import poseFixture from "../../../../packages/contracts/schemas/fixtures/pose.json";
import classificationFixture from "../../../../packages/contracts/schemas/fixtures/classification.json";
import instanceSegFixture from "../../../../packages/contracts/schemas/fixtures/instance_segmentation.json";
import trackingFixture from "../../../../packages/contracts/schemas/fixtures/tracking_detection.json";

export interface GalleryTaskMetadata {
  task: string;
  title: string;
  description: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  document: SightForgeResultDocument;
}

export const GALLERY_TASK_MAP: Record<string, GalleryTaskMetadata> = {
  detection: {
    task: "detection",
    title: "Object Detection",
    description:
      "Locates and classifies distinct objects with 2D axis-aligned bounding boxes (AABBs), confidence scores, and class categories.",
    mediaUrl: "/assets/visual-object-detection.png",
    mediaType: "image",
    document: detectionFixture as unknown as SightForgeResultDocument,
  },
  "instance-segmentation": {
    task: "instance-segmentation",
    title: "Instance Segmentation",
    description:
      "Extracts precise pixel-level polygonal boundary masks for individual instances with distinguishable hatch patterns.",
    mediaUrl: "/assets/visual-instance-segmentation.png",
    mediaType: "image",
    document: instanceSegFixture as unknown as SightForgeResultDocument,
  },
  pose: {
    task: "pose",
    title: "Pose Estimation",
    description:
      "Detects 17-point anatomical keypoints and connected skeletal limb bones with confidence-weighted color overlays.",
    mediaUrl: "/assets/visual-pose-estimation.png",
    mediaType: "image",
    document: poseFixture as unknown as SightForgeResultDocument,
  },
  obb: {
    task: "obb",
    title: "Oriented Bounding Boxes",
    description:
      "Detects arbitrarily rotated objects (aerial, industrial, or angled imagery) with 5-parameter geometry and orientation vectors.",
    mediaUrl: "/assets/visual-oriented-bounding-boxes.png",
    mediaType: "image",
    document: obbFixture as unknown as SightForgeResultDocument,
  },
  classification: {
    task: "classification",
    title: "Image Classification",
    description:
      "Analyzes entire images and ranks category predictions with certainty meters, probability distributions, and class IDs.",
    mediaUrl: "/assets/visual-classification.png",
    mediaType: "image",
    document: classificationFixture as unknown as SightForgeResultDocument,
  },
  tracking: {
    task: "detection",
    title: "Video Object Tracking",
    description:
      "Performs multi-frame temporal association, assigning stable track IDs and rendering motion trajectory trail lines across video frames.",
    mediaUrl: "/assets/visual-video-object-tracking.png",
    mediaType: "video",
    document: trackingFixture as unknown as SightForgeResultDocument,
  },
};
