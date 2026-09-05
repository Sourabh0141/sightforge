/**
 * SightForge Web - Core Types & Enums
 */

export type TaskType =
  | "detection"
  | "instance_segmentation"
  | "semantic_segmentation"
  | "classification"
  | "pose"
  | "obb"
  | "depth";

export type ModelVariant = "nano" | "small";

export type InferenceMode = "per_frame" | "tracking";
