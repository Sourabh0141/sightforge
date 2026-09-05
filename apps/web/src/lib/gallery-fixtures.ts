/**
 * SightForge Web - Gallery Result Fixtures & Task Descriptions (R55, R56, R57, R116)
 */

import type { SightForgeResultDocument } from "@sightforge/contracts";

import detectionFixture from "../../../../packages/contracts/schemas/fixtures/detection.json";
import obbFixture from "../../../../packages/contracts/schemas/fixtures/obb.json";
import poseFixture from "../../../../packages/contracts/schemas/fixtures/pose.json";
import classificationFixture from "../../../../packages/contracts/schemas/fixtures/classification.json";
import instanceSegFixture from "../../../../packages/contracts/schemas/fixtures/instance_segmentation.json";
import trackingFixture from "../../../../packages/contracts/schemas/fixtures/tracking_detection.json";
import semanticSegFixture from "../../../../packages/contracts/schemas/fixtures/semantic_segmentation.json";
import depthFixture from "../../../../packages/contracts/schemas/fixtures/depth.json";

export interface GalleryTaskMetadata {
  task: string;
  title: string;
  description: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  document: SightForgeResultDocument;
  artifactDataUrl?: string;
}

// Generate self-contained mock SVG mask data URLs for static gallery demo
const MOCK_SEMANTIC_MASK_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="180" fill="%2370D0FF" fill-opacity="0.8"/><rect y="180" width="640" height="160" fill="%2320A020" fill-opacity="0.75"/><polygon points="0,480 200,340 440,340 640,480" fill="%23808080" fill-opacity="0.85"/><polygon points="0,340 200,340 0,480" fill="%2320A020" fill-opacity="0.75"/><polygon points="440,340 640,340 640,480" fill="%2320A020" fill-opacity="0.75"/></svg>`;

const MOCK_DEPTH_MAP_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="depthGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="%2322D3EE"/><stop offset="35%" stop-color="%2334D399"/><stop offset="70%" stop-color="%23FBBF24"/><stop offset="100%" stop-color="%23A78BFA"/></linearGradient></defs><rect width="640" height="480" fill="url(%23depthGrad)" fill-opacity="0.8"/></svg>`;

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
  "semantic-segmentation": {
    task: "semantic-segmentation",
    title: "Semantic Segmentation",
    description:
      "Computes per-pixel categorical classifications, blending raster class masks with dual-encoded pattern legends and spatial coverage shares.",
    mediaUrl: "/assets/visual-semantic-segmentation.png",
    mediaType: "image",
    document: semanticSegFixture as unknown as SightForgeResultDocument,
    artifactDataUrl: MOCK_SEMANTIC_MASK_SVG,
  },
  depth: {
    task: "depth",
    title: "Monocular Depth Estimation",
    description:
      "Estimates per-pixel metric scene depth in meters, rendering continuous colorized depth maps, calibrated metric scales, and interactive probes.",
    mediaUrl: "/assets/visual-depth-estimation.png",
    mediaType: "image",
    document: depthFixture as unknown as SightForgeResultDocument,
    artifactDataUrl: MOCK_DEPTH_MAP_SVG,
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
