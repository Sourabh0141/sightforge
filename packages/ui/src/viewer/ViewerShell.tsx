"use client";

/**
 * SightForge UI - Unified Results Viewer Shell (R54, R55, R56, R57, R60, R62, R63, R64, R65, R66, KTD3, KTD4)
 *
 * Hosts:
 * - Visual Viewport (Canvas 2D Overlay, Classification Hero, Video Scrubber).
 * - Raw Result JSON Inspector (R57).
 * - Dense Continuous Visualizations (Semantic Segmentation, Depth Estimation).
 * - Structured Accessible Data Tables (R66, KTD8).
 */

import React, { useState, useMemo, useCallback } from "react";
import type {
  ClassificationResult,
  SemanticSegmentationResult,
  DepthResult,
  BoundingBox,
  CoordinatePoint,
  RotatedBoundingBox,
  PoseKeypoint,
} from "@sightforge/contracts";
import type {
  NormalizedRegion,
  TrackGroup,
  ViewerDisplayOptions,
  ViewerShellProps,
  DepthColormap,
} from "./types";
import { CanvasOverlay } from "./CanvasOverlay";
import { ResultDataTable } from "./ResultDataTable";
import { ClassificationViewer } from "./ClassificationViewer";
import { VideoScrubber } from "./VideoScrubber";
import { RawJsonInspector } from "./inspector/RawJsonInspector";
import { Card } from "../components/Card";
import { getTrackColor } from "./palette";
import {
  computeSemanticSummary,
  computeDepthSummary,
} from "./renderers/dense-summary";

export function ViewerShell({
  document,
  mediaUrl,
  resolveArtifact,
  className = "",
  onRegionSelect,
  onRegionHover,
}: ViewerShellProps) {
  const { task, model_variant, mode, media_type, summary } = document;

  // View state
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [options, setOptions] = useState<ViewerDisplayOptions>({
    minConfidence: 0.25,
    showOverlays: true,
    showLabels: true,
    showTracks: true,
    showCrosshairs: true,
    activeRegionId: null,
    hoveredRegionId: null,
    selectedTrackId: null,
    selectedClassIds: [],
    overlayOpacity: 0.6,
    depthColormap: "turbo",
    viewMode: "visual",
  });

  const isDenseSemantic = task === "semantic-segmentation";
  const isDenseDepth = task === "depth";
  const isDenseTask = isDenseSemantic || isDenseDepth;

  // Extract dense metadata
  const semanticDoc = isDenseSemantic
    ? (document as unknown as SemanticSegmentationResult)
    : null;
  const depthDoc = isDenseDepth ? (document as unknown as DepthResult) : null;

  const semanticPalette = semanticDoc?.artifact?.color_palette || [];
  const depthMetadata = depthDoc?.artifact?.depth_metadata;
  const artifactKey = isDenseSemantic
    ? semanticDoc?.artifact?.key
    : isDenseDepth
      ? depthDoc?.artifact?.key
      : undefined;

  // Compute accessible dense summaries (KTD4, R55, R66)
  const { summaries: semanticSummaries, textSummary: semanticTextSummary } =
    useMemo(() => {
      if (!isDenseSemantic || !semanticDoc?.artifact) {
        return { summaries: [], textSummary: "" };
      }
      return computeSemanticSummary(
        semanticDoc.artifact.color_palette,
        null,
        semanticDoc.artifact.width,
        semanticDoc.artifact.height,
      );
    }, [isDenseSemantic, semanticDoc]);

  const depthSummary = useMemo(() => {
    if (!isDenseDepth || !depthDoc?.artifact?.depth_metadata) return null;
    return computeDepthSummary(
      depthDoc.artifact.depth_metadata,
      null,
      depthDoc.artifact.width,
      depthDoc.artifact.height,
    );
  }, [isDenseDepth, depthDoc]);

  // Extract all frames / tracks for sparse tasks
  const { totalFrames, allRegions, trackGroups } = useMemo(() => {
    const regions: NormalizedRegion[] = [];
    const tracks: TrackGroup[] = [];
    let maxFrames = summary?.frames_processed || 1;

    if (mode === "tracking") {
      const docAsAny = document as any;
      const rawTracks = docAsAny.tracks || [];

      for (const track of rawTracks) {
        const obsList = track.observations || [];
        const trackColor = getTrackColor(track.track_id);
        const trajectory: Array<{ frameIndex: number; x: number; y: number }> =
          [];

        for (const obs of obsList) {
          if (obs.frame_index + 1 > maxFrames) maxFrames = obs.frame_index + 1;

          let cx = 0;
          let cy = 0;
          if (obs.box) {
            cx = obs.box[0] + obs.box[2] / 2;
            cy = obs.box[1] + obs.box[3] / 2;
          } else if (obs.rbox) {
            cx = obs.rbox[0];
            cy = obs.rbox[1];
          }

          trajectory.push({ frameIndex: obs.frame_index, x: cx, y: cy });

          const regBox: BoundingBox =
            obs.box ||
            (obs.rbox
              ? [
                  obs.rbox[0] - obs.rbox[2] / 2,
                  obs.rbox[1] - obs.rbox[3] / 2,
                  obs.rbox[2],
                  obs.rbox[3],
                ]
              : [0, 0, 0, 0]);

          regions.push({
            id: `trk_${track.track_id}_f${obs.frame_index}`,
            task,
            frameIndex: obs.frame_index,
            classId: track.class_id,
            className: track.class_name,
            confidence: obs.confidence,
            box: regBox,
            trackId: track.track_id,
            rawInstance: obs,
            rbox: obs.rbox as RotatedBoundingBox | undefined,
            polygon: obs.polygon as CoordinatePoint[] | undefined,
            keypoints: obs.keypoints as PoseKeypoint[] | undefined,
            trajectory,
          });
        }

        tracks.push({
          trackId: track.track_id,
          classId: track.class_id,
          className: track.class_name,
          confidenceAvg: track.confidence_avg ?? 0.9,
          firstFrameIndex: obsList[0]?.frame_index ?? 0,
          lastFrameIndex: obsList[obsList.length - 1]?.frame_index ?? 0,
          totalObservations: obsList.length,
          color: trackColor,
          observations: obsList,
        });
      }
    } else if (!isDenseTask && task !== "classification") {
      const docAsAny = document as any;
      const rawFrames = docAsAny.frames || [];

      for (const frame of rawFrames) {
        if (frame.frame_index + 1 > maxFrames)
          maxFrames = frame.frame_index + 1;
        const instances = frame.instances || [];

        for (let i = 0; i < instances.length; i++) {
          const inst = instances[i]!;
          const regBox: BoundingBox =
            inst.box ||
            (inst.rbox
              ? [
                  inst.rbox[0] - inst.rbox[2] / 2,
                  inst.rbox[1] - inst.rbox[3] / 2,
                  inst.rbox[2],
                  inst.rbox[3],
                ]
              : [0, 0, 0, 0]);

          regions.push({
            id: `inst_f${frame.frame_index}_${i}`,
            task,
            frameIndex: frame.frame_index,
            classId: inst.class_id,
            className: inst.class_name,
            confidence: inst.confidence,
            box: regBox,
            rawInstance: inst,
            rbox: inst.rbox as RotatedBoundingBox | undefined,
            polygon: inst.polygon as CoordinatePoint[] | undefined,
            keypoints: inst.keypoints as PoseKeypoint[] | undefined,
          });
        }
      }
    }

    return {
      totalFrames: Math.max(1, maxFrames),
      allRegions: regions,
      trackGroups: tracks,
    };
  }, [document, mode, task, summary, isDenseTask]);

  // Current frame regions
  const currentFrameRegions = useMemo(() => {
    if (isDenseTask || task === "classification") return [];
    return allRegions.filter((r) => r.frameIndex === currentFrameIndex);
  }, [allRegions, currentFrameIndex, isDenseTask, task]);

  // Classification predictions if classification task
  const classificationPredictions = useMemo(() => {
    if (task !== "classification") return [];
    const classDoc = document as unknown as ClassificationResult;
    const currentFrame =
      classDoc.frames?.[currentFrameIndex] || classDoc.frames?.[0];
    return currentFrame?.predictions || [];
  }, [document, task, currentFrameIndex]);

  // Handlers
  const handleRegionSelect = useCallback(
    (reg: NormalizedRegion | null) => {
      setOptions((prev) => ({ ...prev, activeRegionId: reg ? reg.id : null }));
      onRegionSelect?.(reg);
    },
    [onRegionSelect],
  );

  const handleRegionHover = useCallback(
    (reg: NormalizedRegion | null) => {
      setOptions((prev) => ({ ...prev, hoveredRegionId: reg ? reg.id : null }));
      onRegionHover?.(reg);
    },
    [onRegionHover],
  );

  const handleTrackSelect = useCallback((trackId: number | null) => {
    setOptions((prev) => ({ ...prev, selectedTrackId: trackId }));
  }, []);

  const handleClassSelect = useCallback((classId: number | null) => {
    setOptions((prev) => {
      if (classId === null) return { ...prev, selectedClassIds: [] };
      const exists = prev.selectedClassIds.includes(classId);
      return {
        ...prev,
        selectedClassIds: exists
          ? prev.selectedClassIds.filter((id) => id !== classId)
          : [...prev.selectedClassIds, classId],
      };
    });
  }, []);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-[#12151C] border border-[#252B37] rounded-[8px]">
        {/* Left: Task badge & View Mode Switch (Visual vs Raw Inspector per R57) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#22D3EE] px-2 py-0.5 rounded bg-[#22D3EE]/10 border border-[#22D3EE]/20">
              {task}
            </span>
            <span className="text-xs font-mono text-[#9AA3B2]">
              {model_variant} • {mode}
            </span>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center p-0.5 bg-[#0A0C10] border border-[#252B37] rounded-[6px] text-xs font-mono">
            <button
              type="button"
              onClick={() =>
                setOptions((prev) => ({ ...prev, viewMode: "visual" }))
              }
              className={`px-2.5 py-1 rounded-[4px] transition-colors ${
                options.viewMode === "visual"
                  ? "bg-[#1A1F29] text-[#22D3EE] font-semibold"
                  : "text-[#9AA3B2] hover:text-[#E8EAED]"
              }`}
            >
              Visualizer
            </button>
            <button
              type="button"
              onClick={() =>
                setOptions((prev) => ({ ...prev, viewMode: "inspector" }))
              }
              className={`px-2.5 py-1 rounded-[4px] transition-colors ${
                options.viewMode === "inspector"
                  ? "bg-[#1A1F29] text-[#22D3EE] font-semibold"
                  : "text-[#9AA3B2] hover:text-[#E8EAED]"
              }`}
            >
              Raw JSON (R57)
            </button>
          </div>
        </div>

        {/* Right: Filters & Toggles */}
        {options.viewMode === "visual" && (
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            {/* Dense Options: Opacity Slider (R55, KTD4) */}
            {isDenseTask && (
              <div className="flex items-center gap-2">
                <label htmlFor="opacity-slider" className="text-[#9AA3B2]">
                  Opacity:{" "}
                  <span className="text-[#22D3EE]">
                    {Math.round(options.overlayOpacity * 100)}%
                  </span>
                </label>
                <input
                  id="opacity-slider"
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(options.overlayOpacity * 100)}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      overlayOpacity: Number(e.target.value) / 100,
                    }))
                  }
                  className="w-20 h-1.5 bg-[#0A0C10] border border-[#252B37] rounded-lg appearance-none cursor-pointer accent-[#22D3EE]"
                />
              </div>
            )}

            {/* Depth Colormap Selector (R55) */}
            {isDenseDepth && (
              <div className="flex items-center gap-2">
                <label htmlFor="colormap-select" className="text-[#9AA3B2]">
                  Colormap:
                </label>
                <select
                  id="colormap-select"
                  value={options.depthColormap}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      depthColormap: e.target.value as DepthColormap,
                    }))
                  }
                  className="bg-[#0A0C10] border border-[#252B37] rounded px-2 py-1 text-xs text-[#E8EAED] focus:outline-none focus:border-[#22D3EE]"
                >
                  <option value="turbo">Turbo (Perceptual)</option>
                  <option value="viridis">Viridis (A11y)</option>
                  <option value="plasma">Plasma</option>
                  <option value="inferno">Inferno</option>
                  <option value="grayscale">Grayscale</option>
                </select>
              </div>
            )}

            {/* Confidence Slider (for sparse tasks) */}
            {!isDenseTask && task !== "classification" && (
              <div className="flex items-center gap-2">
                <label htmlFor="conf-slider" className="text-[#9AA3B2]">
                  Min Conf:{" "}
                  <span className="text-[#22D3EE]">
                    {Math.round(options.minConfidence * 100)}%
                  </span>
                </label>
                <input
                  id="conf-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(options.minConfidence * 100)}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      minConfidence: Number(e.target.value) / 100,
                    }))
                  }
                  className="w-24 h-1.5 bg-[#0A0C10] border border-[#252B37] rounded-lg appearance-none cursor-pointer accent-[#22D3EE]"
                />
              </div>
            )}

            {/* Overlays Toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer text-[#9AA3B2] hover:text-[#E8EAED]">
              <input
                type="checkbox"
                checked={options.showOverlays}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    showOverlays: e.target.checked,
                  }))
                }
                className="rounded bg-[#0A0C10] border-[#252B37] text-[#22D3EE] focus:ring-0"
              />
              <span>Overlay</span>
            </label>

            {/* Labels Toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer text-[#9AA3B2] hover:text-[#E8EAED]">
              <input
                type="checkbox"
                checked={options.showLabels}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    showLabels: e.target.checked,
                  }))
                }
                className="rounded bg-[#0A0C10] border-[#252B37] text-[#22D3EE] focus:ring-0"
              />
              <span>Labels / Scale</span>
            </label>

            {/* Trails Toggle */}
            {mode === "tracking" && (
              <label className="flex items-center gap-1.5 cursor-pointer text-[#9AA3B2] hover:text-[#E8EAED]">
                <input
                  type="checkbox"
                  checked={options.showTracks}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      showTracks: e.target.checked,
                    }))
                  }
                  className="rounded bg-[#0A0C10] border-[#252B37] text-[#22D3EE] focus:ring-0"
                />
                <span>Trails</span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* =========================================================================
          VIEW MODE 1: RAW JSON INSPECTOR (R57)
          ========================================================================= */}
      {options.viewMode === "inspector" ? (
        <RawJsonInspector document={document} />
      ) : (
        /* =========================================================================
            VIEW MODE 2: VISUALIZER (Canvas Viewport + Data Table)
            ========================================================================= */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (65% Viewport) */}
          <div className="lg:col-span-8 space-y-3 flex flex-col">
            <div className="flex-1 bg-[#12151C] border border-[#252B37] rounded-[8px] overflow-hidden min-h-[460px] flex flex-col relative">
              {task === "classification" ? (
                <div className="p-6">
                  <ClassificationViewer
                    predictions={classificationPredictions}
                    frameIndex={currentFrameIndex}
                    timestampMs={currentFrameIndex * 100}
                  />
                </div>
              ) : (
                <CanvasOverlay
                  task={task}
                  regions={currentFrameRegions}
                  currentFrameIndex={currentFrameIndex}
                  mediaUrl={mediaUrl}
                  mediaType={media_type}
                  artifactKey={artifactKey}
                  resolveArtifact={resolveArtifact}
                  semanticPalette={semanticPalette}
                  depthMetadata={depthMetadata}
                  accessibleDescription={
                    isDenseSemantic
                      ? semanticTextSummary
                      : isDenseDepth
                        ? depthSummary?.textSummary
                        : undefined
                  }
                  options={options}
                  onRegionSelect={handleRegionSelect}
                  onRegionHover={handleRegionHover}
                  className="flex-1 min-h-[440px]"
                />
              )}
            </div>

            {/* Video Scrubber Toolbar */}
            {media_type === "video" && totalFrames > 1 && (
              <VideoScrubber
                totalFrames={totalFrames}
                currentFrameIndex={currentFrameIndex}
                sampledFps={summary?.sampled_fps || 10}
                sourceFps={summary?.source_fps || 30}
                durationMs={summary?.duration_ms || 0}
                onFrameChange={setCurrentFrameIndex}
              />
            )}
          </div>

          {/* Right Column (35% Data & Accessibility Table) */}
          <div className="lg:col-span-4 space-y-4 flex flex-col">
            {/* Metric Summary Card */}
            <Card className="p-4 bg-[#12151C] border border-[#252B37] rounded-[8px] space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#9AA3B2]">
                  {isDenseSemantic
                    ? "Palette Classes:"
                    : isDenseDepth
                      ? "Metric Range:"
                      : "Objects in Frame:"}
                </span>
                <span className="text-[#22D3EE] font-bold">
                  {isDenseSemantic
                    ? `${semanticPalette.length} classes`
                    : isDenseDepth && depthMetadata
                      ? `${depthMetadata.min_depth_meters}m – ${depthMetadata.max_depth_meters}m`
                      : currentFrameRegions.length}
                </span>
              </div>
              {mode === "tracking" && (
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#9AA3B2]">Active Track IDs:</span>
                  <span className="text-[#A78BFA] font-bold">
                    {trackGroups.length}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#9AA3B2]">Inference Time:</span>
                <span className="text-[#34D399] font-mono">
                  {summary?.inference_duration_ms?.toFixed(1) || "0.0"} ms
                </span>
              </div>
            </Card>

            {/* Grouped Data Table (outside canvas per R66, KTD4, KTD8) */}
            {task !== "classification" && (
              <ResultDataTable
                mode={mode}
                regions={currentFrameRegions}
                tracks={trackGroups}
                semanticSummaries={semanticSummaries}
                depthSummary={depthSummary}
                activeRegionId={options.activeRegionId}
                hoveredRegionId={options.hoveredRegionId}
                selectedTrackId={options.selectedTrackId}
                selectedClassIds={options.selectedClassIds}
                onRegionSelect={handleRegionSelect}
                onRegionHover={handleRegionHover}
                onTrackSelect={handleTrackSelect}
                onClassSelect={handleClassSelect}
                className="flex-1"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
