/**
 * SightForge Task Configuration Panel (P4 U5, R60, R36, R41, R42)
 *
 * Exposes task selection, model tier, video inference mode (with conditional
 * tracking support enforcement), COCO class filtering, frame sampling rate,
 * and confidence threshold.
 */

"use client";

import React, { useState, useMemo } from "react";
import {
  Card,
  Button,
  BoxIcon,
  LayersIcon,
  LayoutGridIcon,
  SlidersIcon,
  RotateCwIcon,
  InfoIcon,
  SearchIcon,
  XIcon,
  CheckIcon,
  FilterIcon,
} from "@sightforge/ui";
import {
  COCO_CLASSES,
  COCO_PRESETS,
  COCO_CLASS_ITEMS,
  type CocoClassItem,
} from "@sightforge/contracts";
import type { TaskType, ModelVariant, InferenceMode } from "../lib/types";

export interface TaskConfigValues {
  task: TaskType;
  modelVariant: ModelVariant;
  mode: InferenceMode;
  confidenceThreshold: number;
  sampledFps: number;
  classes?: number[];
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
  supportsClassFiltering: boolean;
}

const TASK_OPTIONS: TaskOption[] = [
  {
    id: "detection",
    label: "Object Detection",
    description: "Bounding boxes with class & confidence",
    icon: <BoxIcon size={16} />,
    supportsTracking: true,
    supportsClassFiltering: true,
  },
  {
    id: "instance_segmentation",
    label: "Instance Segmentation",
    description: "Per-instance polygonal object masks",
    icon: <LayersIcon size={16} />,
    supportsTracking: true,
    supportsClassFiltering: true,
  },
  {
    id: "semantic_segmentation",
    label: "Semantic Segmentation",
    description: "Dense per-pixel class field & coverage",
    icon: <LayoutGridIcon size={16} />,
    supportsTracking: false,
    supportsClassFiltering: true,
  },
  {
    id: "classification",
    label: "Classification",
    description: "Ranked list of category probabilities",
    icon: <SlidersIcon size={16} />,
    supportsTracking: false,
    supportsClassFiltering: false,
  },
  {
    id: "pose",
    label: "Pose Estimation",
    description: "17-keypoint anatomical skeleton",
    icon: <BoxIcon size={16} />,
    supportsTracking: true,
    supportsClassFiltering: false,
  },
  {
    id: "obb",
    label: "Oriented Bounding Box",
    description: "Rotated minimum bounding boxes",
    icon: <RotateCwIcon size={16} />,
    supportsTracking: true,
    supportsClassFiltering: false,
  },
  {
    id: "depth",
    label: "Depth Estimation",
    description: "Monocular metric surface depth map",
    icon: <LayersIcon size={16} />,
    supportsTracking: false,
    supportsClassFiltering: false,
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
  const [isClassDropdownOpen, setIsClassDropdownOpen] = useState(false);
  const [classSearchQuery, setClassSearchQuery] = useState("");

  const selectedTaskMeta = TASK_OPTIONS.find((t) => t.id === values.task);
  const taskSupportsTracking = selectedTaskMeta?.supportsTracking ?? false;
  const taskSupportsClassFiltering =
    selectedTaskMeta?.supportsClassFiltering ?? false;

  const selectedClasses = useMemo(() => values.classes ?? [], [values.classes]);

  const isAllClasses = selectedClasses.length === 0;

  const filteredClassItems = useMemo(() => {
    if (!classSearchQuery.trim()) return COCO_CLASS_ITEMS;
    const query = classSearchQuery.toLowerCase().trim();
    return COCO_CLASS_ITEMS.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        String(item.id).includes(query),
    );
  }, [classSearchQuery]);

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
      classes: meta?.supportsClassFiltering ? values.classes : undefined,
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

  const handlePresetSelect = (classIds: number[]) => {
    onChange({
      ...values,
      classes: classIds.length > 0 ? [...classIds] : undefined,
    });
  };

  const handleToggleClass = (classId: number) => {
    let updated: number[];
    if (isAllClasses) {
      // If currently all classes, clicking one narrows down to that specific class
      updated = [classId];
    } else if (selectedClasses.includes(classId)) {
      updated = selectedClasses.filter((id) => id !== classId);
    } else {
      updated = [...selectedClasses, classId].sort((a, b) => a - b);
    }

    onChange({
      ...values,
      classes: updated.length > 0 ? updated : undefined,
    });
  };

  const handleSelectAllClasses = () => {
    onChange({
      ...values,
      classes: undefined,
    });
  };

  const handleClearAllClasses = () => {
    onChange({
      ...values,
      classes: [],
    });
  };

  const handleRemoveClassTag = (classId: number) => {
    const updated = selectedClasses.filter((id) => id !== classId);
    onChange({
      ...values,
      classes: updated.length > 0 ? updated : undefined,
    });
  };

  // Dynamic step numbering
  let stepIndex = 1;
  const taskStep = stepIndex++;
  const modelStep = stepIndex++;
  const classFilterStep = taskSupportsClassFiltering ? stepIndex++ : null;
  const videoStep = isVideo ? stepIndex++ : null;
  const confStep = stepIndex++;

  return (
    <Card className="space-y-6 bg-[#12151C] border-[#252B37] p-6">
      {/* 1. Task Selection */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#9AA3B2]">
            {taskStep}. Computer Vision Task
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
            {modelStep}. Model Size
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

      {/* 3. COCO Class Selection (Shown when task supports class filtering) */}
      {taskSupportsClassFiltering && classFilterStep && (
        <div className="space-y-3 pt-4 border-t border-[#252B37]">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9AA3B2] flex items-center gap-1.5">
              <FilterIcon size={13} className="text-[#22D3EE]" />
              {classFilterStep}. Object Classes
            </label>
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                isAllClasses
                  ? "bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/30"
                  : "bg-[#A78BFA]/10 text-[#A78BFA] border-[#A78BFA]/30"
              }`}
            >
              {isAllClasses
                ? "All 80 Classes"
                : `${selectedClasses.length} Selected`}
            </span>
          </div>

          {/* Quick Category Presets */}
          <div className="flex flex-wrap gap-1.5">
            {COCO_PRESETS.map((preset) => {
              const isPresetActive =
                (preset.id === "all" && isAllClasses) ||
                (preset.id !== "all" &&
                  preset.classIds.length > 0 &&
                  preset.classIds.length === selectedClasses.length &&
                  preset.classIds.every((id) => selectedClasses.includes(id)));

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetSelect(preset.classIds)}
                  className={`px-2.5 py-1 rounded-[6px] text-[11px] font-medium border transition-all ${
                    isPresetActive
                      ? "bg-[#22D3EE]/20 border-[#22D3EE] text-[#22D3EE]"
                      : "bg-[#1A1F29]/60 border-[#252B37] text-[#9AA3B2] hover:bg-[#1A1F29] hover:text-[#E8EAED]"
                  }`}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Expandable Class Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsClassDropdownOpen(!isClassDropdownOpen)}
              className="w-full flex items-center justify-between p-2.5 rounded-[8px] bg-[#1A1F29] border border-[#252B37] text-left hover:border-[#252B37]/80 transition-all focus:outline-none focus:ring-2 focus:ring-[#22D3EE]"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <SearchIcon size={14} className="text-[#6B7280] shrink-0" />
                <span className="text-xs text-[#E8EAED] truncate">
                  {isAllClasses
                    ? "Detect all COCO classes (click to customize)"
                    : `Filtered to ${selectedClasses.length} classes: ${selectedClasses
                        .map((id) => COCO_CLASSES[id])
                        .slice(0, 3)
                        .join(", ")}${selectedClasses.length > 3 ? "..." : ""}`}
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#22D3EE] shrink-0 ml-2">
                {isClassDropdownOpen ? "Close ▲" : "Browse ▼"}
              </span>
            </button>

            {/* Dropdown Menu Container */}
            {isClassDropdownOpen && (
              <div className="mt-2 p-3 rounded-[8px] bg-[#1A1F29] border border-[#252B37] shadow-xl space-y-3 z-30">
                {/* Search Bar & Fast Actions */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <SearchIcon
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B7280]"
                    />
                    <input
                      type="text"
                      value={classSearchQuery}
                      onChange={(e) => setClassSearchQuery(e.target.value)}
                      placeholder="Search classes (e.g., person, car, dog)..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#12151C] border border-[#252B37] rounded-[6px] text-[#E8EAED] placeholder-[#6B7280] focus:outline-none focus:border-[#22D3EE]"
                    />
                    {classSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setClassSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#E8EAED]"
                      >
                        <XIcon size={12} />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleSelectAllClasses}
                    className="px-2 py-1.5 text-[11px] font-medium rounded-[6px] bg-[#12151C] border border-[#252B37] text-[#22D3EE] hover:bg-[#22D3EE]/10"
                  >
                    All (80)
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllClasses}
                    className="px-2 py-1.5 text-[11px] font-medium rounded-[6px] bg-[#12151C] border border-[#252B37] text-[#9AA3B2] hover:text-[#E8EAED]"
                  >
                    Clear
                  </button>
                </div>

                {/* Scrollable Class Grid */}
                <div className="max-h-52 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 gap-1.5 custom-scrollbar">
                  {filteredClassItems.map((item: CocoClassItem) => {
                    const isChecked =
                      isAllClasses || selectedClasses.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleToggleClass(item.id)}
                        className={`flex items-center gap-1.5 p-1.5 rounded-[6px] text-left text-xs transition-all border ${
                          isChecked
                            ? "bg-[#22D3EE]/15 border-[#22D3EE]/40 text-[#E8EAED]"
                            : "bg-[#12151C]/60 border-[#252B37]/60 text-[#6B7280] hover:border-[#252B37] hover:text-[#9AA3B2]"
                        }`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
                            isChecked
                              ? "bg-[#22D3EE] border-[#22D3EE] text-[#12151C]"
                              : "border-[#6B7280]/60 bg-transparent"
                          }`}
                        >
                          {isChecked && <CheckIcon size={10} strokeWidth={3} />}
                        </div>
                        <span className="truncate">{item.name}</span>
                        <span className="ml-auto text-[9px] font-mono text-[#6B7280]">
                          #{item.id}
                        </span>
                      </button>
                    );
                  })}
                  {filteredClassItems.length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-[#6B7280]">
                      No classes found matching &quot;{classSearchQuery}&quot;
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Selected Tag Chips (When custom subset selected) */}
          {!isAllClasses && selectedClasses.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
                <span>Active Filters ({selectedClasses.length}):</span>
                <button
                  type="button"
                  onClick={handleSelectAllClasses}
                  className="text-[#22D3EE] hover:underline"
                >
                  Reset to All
                </button>
              </div>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {selectedClasses.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[#22D3EE]/10 border border-[#22D3EE]/30 text-[#22D3EE]"
                  >
                    {COCO_CLASSES[id]}
                    <button
                      type="button"
                      onClick={() => handleRemoveClassTag(id)}
                      className="hover:text-[#FFFFFF] focus:outline-none"
                      title={`Remove ${COCO_CLASSES[id]}`}
                    >
                      <XIcon size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Video Options (Shown only when media is Video) */}
      {isVideo && (
        <div className="space-y-4 pt-4 border-t border-[#252B37]">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#9AA3B2] block">
              {videoStep}. Video Inference Mode
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

      {/* 5. Confidence Threshold Slider */}
      <div className="space-y-2 pt-4 border-t border-[#252B37]">
        <div className="flex items-center justify-between text-xs font-mono">
          <label
            htmlFor="confidence-slider"
            className="font-semibold uppercase tracking-wider text-[#9AA3B2]"
          >
            {confStep}. Confidence Threshold
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
