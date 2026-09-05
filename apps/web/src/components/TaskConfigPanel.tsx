/**
 * SightForge Task Configuration Panel (P4 U5, R60, R36, R41, R42)
 *
 * Exposes task selection, model tier, video inference mode (with conditional
 * tracking support enforcement), frame sampling rate, and confidence threshold.
 */

"use client";

import React from "react";
import {
  Card,
  Button,
  BoxIcon,
  LayersIcon,
  LayoutGridIcon,
  SlidersIcon,
  RotateCwIcon,
  InfoIcon,
} from "@sightforge/ui";
import type { TaskType, ModelVariant, InferenceMode } from "../lib/types";

export interface TaskConfigValues {
  task: TaskType;
  modelVariant: ModelVariant;
  mode: InferenceMode;
  confidenceThreshold: number;
  sampledFps: number;
}

export interface TaskConfigPanelProps {
  values: TaskConfigValues;
  onChange: (values: TaskConfigValues) => void;
  isVideo: boolean;
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
}

interface TaskOption {
  id: TaskType;
  label: string;
  description: string;
  icon: React.ReactNode;
  supportsTracking: boolean;
}

const TASK_OPTIONS: TaskOption[] = [
  {
    id: "detection",
    label: "Object Detection",
    description: "Bounding boxes with class & confidence",
    icon: <BoxIcon size={16} />,
    supportsTracking: true,
  },
  {
    id: "instance_segmentation",
    label: "Instance Segmentation",
    description: "Per-instance polygonal object masks",
    icon: <LayersIcon size={16} />,
    supportsTracking: true,
  },
  {
    id: "semantic_segmentation",
    label: "Semantic Segmentation",
    description: "Dense per-pixel class field & coverage",
    icon: <LayoutGridIcon size={16} />,
    supportsTracking: false,
  },
  {
    id: "classification",
    label: "Classification",
    description: "Ranked list of category probabilities",
    icon: <SlidersIcon size={16} />,
    supportsTracking: false,
  },
  {
    id: "pose",
    label: "Pose Estimation",
    description: "17-keypoint anatomical skeleton",
    icon: <BoxIcon size={16} />,
    supportsTracking: true,
  },
  {
    id: "obb",
    label: "Oriented Bounding Box",
    description: "Rotated minimum bounding boxes",
    icon: <RotateCwIcon size={16} />,
    supportsTracking: true,
  },
  {
    id: "depth",
    label: "Depth Estimation",
    description: "Monocular metric surface depth map",
    icon: <LayersIcon size={16} />,
    supportsTracking: false,
  },
];

export const TaskConfigPanel: React.FC<TaskConfigPanelProps> = ({
  values,
  onChange,
  isVideo,
  canSubmit,
  isSubmitting,
  onSubmit,
}) => {
  const selectedTaskMeta = TASK_OPTIONS.find((t) => t.id === values.task);
  const taskSupportsTracking = selectedTaskMeta?.supportsTracking ?? false;

  const handleTaskSelect = (task: TaskType) => {
    const meta = TASK_OPTIONS.find((t) => t.id === task);
    const newMode: InferenceMode =
      isVideo && !meta?.supportsTracking && values.mode === "tracking"
        ? "per_frame"
        : values.mode;

    onChange({
      ...values,
      task,
      mode: newMode,
    });
  };

  const handleModelSelect = (modelVariant: ModelVariant) => {
    onChange({ ...values, modelVariant });
  };

  const handleModeSelect = (mode: InferenceMode) => {
    if (mode === "tracking" && !taskSupportsTracking) return;
    onChange({ ...values, mode });
  };

  const handleConfidenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const confidenceThreshold = parseFloat(e.target.value);
    onChange({ ...values, confidenceThreshold });
  };

  const handleFpsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sampledFps = parseInt(e.target.value, 10);
    onChange({ ...values, sampledFps });
  };

  return (
    <Card className="space-y-6 bg-[#12151C] border-[#252B37] p-6">
      {/* 1. Task Selection */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#9AA3B2]">
            1. Computer Vision Task
          </label>
          <span className="text-[11px] font-mono text-[#22D3EE]">
            {selectedTaskMeta?.label}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TASK_OPTIONS.map((task) => {
            const isSelected = values.task === task.id;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => handleTaskSelect(task.id)}
                className={`flex flex-col text-left p-3 rounded-[8px] border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#22D3EE] ${
                  isSelected
                    ? "border-[#22D3EE] bg-[#22D3EE]/10 text-[#E8EAED]"
                    : "border-[#252B37] bg-[#1A1F29]/50 hover:bg-[#1A1F29] hover:border-[#252B37]/80 text-[#9AA3B2]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`${isSelected ? "text-[#22D3EE]" : "text-[#9AA3B2]"}`}
                  >
                    {task.icon}
                  </span>
                  <span className="text-xs font-semibold text-[#E8EAED]">
                    {task.label}
                  </span>
                </div>
                <span className="text-[11px] text-[#6B7280] line-clamp-1">
                  {task.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Model Size Tier */}
      <div className="space-y-2.5 pt-4 border-t border-[#252B37]">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#9AA3B2]">
            2. Model Size
          </label>
          <span className="text-[11px] font-mono text-[#6B7280]">
            {values.modelVariant === "nano" ? "~35ms latency" : "~95ms latency"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-[#1A1F29] p-1 rounded-[8px] border border-[#252B37]">
          <button
            type="button"
            onClick={() => handleModelSelect("nano")}
            className={`py-2 px-3 rounded-[6px] text-xs font-medium transition-all ${
              values.modelVariant === "nano"
                ? "bg-[#12151C] text-[#22D3EE] border border-[#22D3EE]/30 shadow-sm"
                : "text-[#9AA3B2] hover:text-[#E8EAED]"
            }`}
          >
            <span className="font-semibold block">Nano</span>
            <span className="text-[10px] opacity-75">Fastest inference</span>
          </button>

          <button
            type="button"
            onClick={() => handleModelSelect("small")}
            className={`py-2 px-3 rounded-[6px] text-xs font-medium transition-all ${
              values.modelVariant === "small"
                ? "bg-[#12151C] text-[#22D3EE] border border-[#22D3EE]/30 shadow-sm"
                : "text-[#9AA3B2] hover:text-[#E8EAED]"
            }`}
          >
            <span className="font-semibold block">Small</span>
            <span className="text-[10px] opacity-75">Higher accuracy</span>
          </button>
        </div>
      </div>

      {/* 3. Video Options (Shown only when media is Video) */}
      {isVideo && (
        <div className="space-y-4 pt-4 border-t border-[#252B37]">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9AA3B2] block">
              3. Video Inference Mode
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleModeSelect("per_frame")}
                className={`p-3 rounded-[8px] border text-left transition-all ${
                  values.mode === "per_frame"
                    ? "border-[#22D3EE] bg-[#22D3EE]/10 text-[#E8EAED]"
                    : "border-[#252B37] bg-[#1A1F29]/50 hover:bg-[#1A1F29] text-[#9AA3B2]"
                }`}
              >
                <span className="text-xs font-semibold block text-[#E8EAED]">
                  Per-frame
                </span>
                <span className="text-[11px] text-[#6B7280] block mt-0.5">
                  Analyses sampled frames independently
                </span>
              </button>

              <button
                type="button"
                disabled={!taskSupportsTracking}
                onClick={() => handleModeSelect("tracking")}
                className={`p-3 rounded-[8px] border text-left transition-all relative ${
                  !taskSupportsTracking
                    ? "opacity-50 cursor-not-allowed border-[#252B37] bg-[#1A1F29]/20 text-[#6B7280]"
                    : values.mode === "tracking"
                      ? "border-[#22D3EE] bg-[#22D3EE]/10 text-[#E8EAED]"
                      : "border-[#252B37] bg-[#1A1F29]/50 hover:bg-[#1A1F29] text-[#9AA3B2]"
                }`}
              >
                <span className="text-xs font-semibold block">Tracking</span>
                <span className="text-[11px] block mt-0.5">
                  Follows objects with persistent IDs
                </span>
              </button>
            </div>

            {/* Critical Conditional Tracking Rule (R60) */}
            {!taskSupportsTracking && (
              <div className="flex items-start gap-1.5 p-2 rounded-[6px] bg-[#1A1F29] border border-[#252B37] text-[11px] text-[#9AA3B2]">
                <InfoIcon
                  size={14}
                  className="text-[#FBBF24] shrink-0 mt-0.5"
                />
                <span>
                  Tracking needs objects to follow. Not available for this task.
                </span>
              </div>
            )}
          </div>

          {/* Frame Rate Sampling Slider (Shown only for per_frame) */}
          {values.mode === "per_frame" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#9AA3B2]">Frame Sampling Rate</span>
                <span className="text-[#22D3EE] font-semibold">
                  {values.sampledFps} fps
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="10"
                step="1"
                value={values.sampledFps}
                onChange={handleFpsChange}
                className="w-full accent-[#22D3EE] bg-[#1A1F29] rounded-lg h-2 cursor-pointer"
                aria-label="Frame sampling rate in FPS"
              />
              <div className="flex justify-between text-[10px] font-mono text-[#6B7280]">
                <span>2 fps (sparse)</span>
                <span>10 fps (dense)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Confidence Threshold Slider */}
      <div className="space-y-2 pt-4 border-t border-[#252B37]">
        <div className="flex items-center justify-between text-xs font-mono">
          <label
            htmlFor="confidence-slider"
            className="font-semibold uppercase tracking-wider text-[#9AA3B2]"
          >
            {isVideo ? "4. Confidence Threshold" : "3. Confidence Threshold"}
          </label>
          <span className="text-[#22D3EE] font-semibold">
            {values.confidenceThreshold.toFixed(2)}
          </span>
        </div>
        <input
          id="confidence-slider"
          type="range"
          min="0.0"
          max="1.0"
          step="0.01"
          value={values.confidenceThreshold}
          onChange={handleConfidenceChange}
          className="w-full accent-[#22D3EE] bg-[#1A1F29] rounded-lg h-2 cursor-pointer"
          aria-label="Confidence threshold from 0 to 1"
        />
        <div className="flex justify-between text-[10px] font-mono text-[#6B7280]">
          <span>0.00 (permissive)</span>
          <span>0.25 (default)</span>
          <span>1.00 (strict)</span>
        </div>
      </div>

      {/* Submit Action */}
      <div className="pt-2">
        <Button
          variant="primary"
          size="lg"
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          className="w-full justify-center text-sm font-semibold"
        >
          {isSubmitting ? "Submitting job…" : "Run analysis"}
        </Button>
      </div>
    </Card>
  );
};
