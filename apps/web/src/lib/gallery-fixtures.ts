/**
 * SightForge Web - Gallery Result Fixtures, Metadata & Task Explainers (R54, R55, R56, R57, R116, KTD2)
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
  slug: string;
  task: string;
  title: string;
  shortDesc: string;
  explainer: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  meta: string;
  isVideo?: boolean;
  document: SightForgeResultDocument;
  artifactDataUrl?: string;
  highlights: Array<{ label: string; value: string }>;
}

export const GALLERY_ORDER: string[] = [
  "detection",
  "instance-segmentation",
  "semantic-segmentation",
  "classification",
  "pose",
  "obb",
  "depth",
  "tracking",
];

// Self-contained SVG mask data URLs for static raster demo rendering
const MOCK_SEMANTIC_MASK_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="180" fill="%2370D0FF" fill-opacity="0.8"/><rect y="180" width="640" height="160" fill="%2320A020" fill-opacity="0.75"/><polygon points="0,480 200,340 440,340 640,480" fill="%23808080" fill-opacity="0.85"/><polygon points="0,340 200,340 0,480" fill="%2320A020" fill-opacity="0.75"/><polygon points="440,340 640,340 640,480" fill="%2320A020" fill-opacity="0.75"/></svg>`;

const MOCK_DEPTH_MAP_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="depthGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="%2322D3EE"/><stop offset="35%" stop-color="%2334D399"/><stop offset="70%" stop-color="%23FBBF24"/><stop offset="100%" stop-color="%23A78BFA"/></linearGradient></defs><rect width="640" height="480" fill="url(%23depthGrad)" fill-opacity="0.8"/></svg>`;

export const GALLERY_TASK_MAP: Record<string, GalleryTaskMetadata> = {
  detection: {
    slug: "detection",
    task: "detection",
    title: "Object Detection",
    shortDesc:
      "2D axis-aligned bounding boxes with class categories & confidence scores",
    explainer:
      "Object detection identifies and pinpoints multiple distinct entities in a single frame. Each object is bounded by a 2D rectangular box with an attached classification label and confidence metric, allowing spatial localization and category recognition.",
    mediaUrl: "/assets/visual-object-detection.png",
    mediaType: "image",
    meta: "2 instances · 640×640 · 42.5ms",
    document: detectionFixture as unknown as SightForgeResultDocument,
    highlights: [
      { label: "Target Model", value: "YOLO26 Nano (yolo26n)" },
      { label: "Primary Classes", value: "person, dog" },
      { label: "Top Confidence", value: "94.2% (person)" },
      { label: "Inference Latency", value: "42.5ms" },
    ],
  },
  "instance-segmentation": {
    slug: "instance-segmentation",
    task: "instance-segmentation",
    title: "Instance Segmentation",
    shortDesc:
      "Pixel-accurate polygonal boundary masks for individual object instances",
    explainer:
      "Instance segmentation separates individual objects at pixel-level resolution. Unlike standard detection boxes, each detected instance receives an exact polygonal boundary contour and distinguishable hatch fill pattern, distinguishing overlapping entities of the same class.",
    mediaUrl: "/assets/visual-instance-segmentation.png",
    mediaType: "image",
    meta: "1 instance mask · 640×640 · 58.2ms",
    document: instanceSegFixture as unknown as SightForgeResultDocument,
    highlights: [
      { label: "Target Model", value: "YOLO26-Seg (yolo26n-seg)" },
      { label: "Detected Instance", value: "car (91.5%)" },
      { label: "Mask Geometry", value: "4-vertex Polygon" },
      { label: "Inference Latency", value: "58.2ms" },
    ],
  },
  "semantic-segmentation": {
    slug: "semantic-segmentation",
    task: "semantic-segmentation",
    title: "Semantic Segmentation",
    shortDesc:
      "Dense per-pixel categorical classifications with dual-encoded color palettes",
    explainer:
      "Semantic segmentation classifies every individual pixel in an image into a category (such as road, sky, or vegetation). Rather than tracking distinct objects, it creates a continuous dense surface overlay representing scene composition and environmental coverage.",
    mediaUrl: "/assets/visual-semantic-segmentation.png",
    mediaType: "image",
    meta: "4 scene classes · 640×480 · 64.0ms",
    document: semanticSegFixture as unknown as SightForgeResultDocument,
    artifactDataUrl: MOCK_SEMANTIC_MASK_SVG,
    highlights: [
      { label: "Target Model", value: "YOLO26-Semantic" },
      {
        label: "Segmented Classes",
        value: "sky, road, vegetation, background",
      },
      { label: "Dual-Encoding", value: "Pattern borders + Color Palette" },
      { label: "Inference Latency", value: "64.0ms" },
    ],
  },
  classification: {
    slug: "classification",
    task: "classification",
    title: "Image Classification",
    shortDesc:
      "Full-scene category predictions with certainty meters & probability ranking",
    explainer:
      "Image classification evaluates the entire image as a whole, ranking the most likely categories across hundreds of learned concepts. The result presents a ranked distribution of probability confidence scores without spatial bounding boxes.",
    mediaUrl: "/assets/visual-classification.png",
    mediaType: "image",
    meta: "Top 3 classes · 224×224 · 12.8ms",
    document: classificationFixture as unknown as SightForgeResultDocument,
    highlights: [
      { label: "Target Model", value: "YOLO26-Cls (yolo26n-cls)" },
      { label: "Top Prediction", value: "golden_retriever (89.2%)" },
      { label: "Secondary Class", value: "labrador_retriever (7.4%)" },
      { label: "Inference Latency", value: "12.8ms" },
    ],
  },
  pose: {
    slug: "pose",
    task: "pose",
    title: "Pose Estimation",
    shortDesc:
      "17-point anatomical keypoint detection with connected skeletal limb topology",
    explainer:
      "Pose estimation tracks anatomical human body keypoints (eyes, ears, shoulders, elbows, wrists, hips, knees, ankles) and connects them via topological limb bones. It enables biomechanical analysis, gesture tracking, and ergonomic posture evaluation.",
    mediaUrl: "/assets/visual-pose-estimation.png",
    mediaType: "image",
    meta: "1 person · 17 keypoints · 45.1ms",
    document: poseFixture as unknown as SightForgeResultDocument,
    highlights: [
      { label: "Target Model", value: "YOLO26-Pose (yolo26n-pose)" },
      { label: "Keypoint Count", value: "17 COCO Keypoints" },
      { label: "Limb Topology", value: "19 Skeletal Bones" },
      { label: "Inference Latency", value: "45.1ms" },
    ],
  },
  obb: {
    slug: "obb",
    task: "obb",
    title: "Oriented Bounding Boxes",
    shortDesc:
      "Rotated 5-parameter bounding quadrilaterals for angled & aerial objects",
    explainer:
      "Oriented Bounding Boxes (OBB) fit tightly around objects rotated at arbitrary angles. Standard horizontal bounding boxes capture excessive empty background on diagonal objects; OBB computes orientation angles and exact corner coordinates for tight alignment.",
    mediaUrl: "/assets/visual-oriented-bounding-boxes.png",
    mediaType: "image",
    meta: "1 rotated box · 640×640 · 48.7ms",
    document: obbFixture as unknown as SightForgeResultDocument,
    highlights: [
      { label: "Target Model", value: "YOLO26-OBB (yolo26n-obb)" },
      { label: "Detected Entity", value: "ship (92.4%)" },
      { label: "Rotation Angle", value: "35.0° (0.61 rad)" },
      { label: "Inference Latency", value: "48.7ms" },
    ],
  },
  depth: {
    slug: "depth",
    task: "depth",
    title: "Monocular Depth Estimation",
    shortDesc:
      "Continuous 16-bit metric scene depth estimation with calibrated distance scale",
    explainer:
      "Monocular depth estimation predicts the metric distance of every scene element from a single 2D camera view. It renders a continuous color-mapped depth field with an interactive probe reticle, calibrated meter scale, and spatial foreground/background distribution.",
    mediaUrl: "/assets/visual-depth-estimation.png",
    mediaType: "image",
    meta: "Metric depth · 0.25m – 18.5m · 72.4ms",
    document: depthFixture as unknown as SightForgeResultDocument,
    artifactDataUrl: MOCK_DEPTH_MAP_SVG,
    highlights: [
      { label: "Target Model", value: "Depth-Anything-V2" },
      { label: "Metric Range", value: "0.25m – 18.5m" },
      { label: "Color Palette", value: "Turbo / Viridis / Plasma" },
      { label: "Inference Latency", value: "72.4ms" },
    ],
  },
  tracking: {
    slug: "tracking",
    task: "detection",
    title: "Video Object Tracking",
    shortDesc:
      "Multi-frame temporal association with persistent track IDs & trajectory lines",
    explainer:
      "Video object tracking maintains stable identity across continuous video frames. Utilizing Kalman filtering and deep feature matching, each tracked object retains a consistent ID, persistent color mapping, and motion path trail across temporal occlusions.",
    mediaUrl: "/assets/visual-video-object-tracking.png",
    mediaType: "video",
    meta: "2 active tracks · 50 frames · BoT-SORT",
    isVideo: true,
    document: trackingFixture as unknown as SightForgeResultDocument,
    highlights: [
      { label: "Tracking Algorithm", value: "BoT-SORT + ByteTrack" },
      { label: "Tracked Entities", value: "Track #1 (person), Track #2 (car)" },
      { label: "Temporal Span", value: "50 Frames @ 10.0 FPS" },
      { label: "Total Latency", value: "1120.0ms (5.0s Clip)" },
    ],
  },
};

export function getAdjacentGalleryTasks(currentSlug: string): {
  prev: GalleryTaskMetadata;
  next: GalleryTaskMetadata;
} {
  const currentIndex = GALLERY_ORDER.indexOf(currentSlug);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;

  const prevIndex =
    (safeIndex - 1 + GALLERY_ORDER.length) % GALLERY_ORDER.length;
  const nextIndex = (safeIndex + 1) % GALLERY_ORDER.length;

  const prevSlug = GALLERY_ORDER[prevIndex] || "tracking";
  const nextSlug = GALLERY_ORDER[nextIndex] || "detection";

  return {
    prev: GALLERY_TASK_MAP[prevSlug]!,
    next: GALLERY_TASK_MAP[nextSlug]!,
  };
}

export function getGalleryStaticParams(): Array<{ task: string }> {
  return GALLERY_ORDER.map((task) => ({ task }));
}
