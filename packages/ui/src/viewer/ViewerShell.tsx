"use client";

/**
 * SightForge UI - Unified Results Viewer Shell (R54, R55, R56, R60, R62, R63, R64, R65, R66, KTD3)
 */

import React, { useState, useMemo, useCallback } from "react";
import type {
  ClassificationResult,
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
} from "./types";
import { CanvasOverlay } from "./CanvasOverlay";
import { ResultDataTable } from "./ResultDataTable";
import { ClassificationViewer } from "./ClassificationViewer";
import { VideoScrubber } from "./VideoScrubber";
import { Card } from "../components/Card";
import { getTrackColor } from "./palette";

export function ViewerShell({
  document,
  mediaUrl,
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
  });

  // Extract all frames / tracks based on task type
  const { totalFrames, allRegions, trackGroups } = useMemo(() => {
    const regions: NormalizedRegion[] = [];
    const tracks: TrackGroup[] = [];
    let maxFrames = summary?.frames_processed || 1;

    if (mode === "tracking") {
      // 1. TRACKING MODE EXTRACTION
      const docAsAny = document as any;
      const rawTracks = docAsAny.tracks || [];

      for (const track of rawTracks) {
        const obsList = track.observations || [];
        const trackColor = getTrackColor(track.track_id);
        const trajectory: Array<{ frameIndex: number; x: number; y: number }> =
          [];

        for (const obs of obsList) {
          if (obs.frame_index + 1 > maxFrames) maxFrames = obs.frame_index + 1;

          // Compute centroid for trajectory
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

          // Normalized region item for this observation
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
    } else {
      // 2. PER-FRAME MODE EXTRACTION
      const docAsAny = document as any;
      const rawFrames = docAsAny.frames || [];

      for (const frame of rawFrames) {
        if (frame.frame_index + 1 > maxFrames)
          maxFrames = frame.frame_index + 1;
        const instances = frame.instances || [];

        for (let i = 0; i < instances.length; i++) {
          const inst = instances[i];
          let regBox: BoundingBox = inst.box || [0, 0, 0, 0];
          if (inst.rbox) {
            regBox = [
              inst.rbox[0] - inst.rbox[2] / 2,
              inst.rbox[1] - inst.rbox[3] / 2,
              inst.rbox[2],
              inst.rbox[3],
            ];
          }

          regions.push({
            id: `f${frame.frame_index}_inst${i}`,
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
  }, [document, mode, task, summary]);

  // Regions on the current active frame
  const currentFrameRegions = useMemo(() => {
    return allRegions.filter((r) => r.frameIndex === currentFrameIndex);
  }, [allRegions, currentFrameIndex]);

  // Handle region interactions
  const handleRegionSelect = useCallback(
    (region: NormalizedRegion | null) => {
      setOptions((prev) => ({
        ...prev,
        activeRegionId: region ? region.id : null,
        selectedTrackId: region?.trackId ?? null,
      }));
      onRegionSelect?.(region);
    },
    [onRegionSelect],
  );

  const handleRegionHover = useCallback(
    (region: NormalizedRegion | null) => {
      setOptions((prev) => ({
        ...prev,
        hoveredRegionId: region ? region.id : null,
      }));
      onRegionHover?.(region);
    },
    [onRegionHover],
  );

  const handleTrackSelect = useCallback(
    (trackId: number | null) => {
      setOptions((prev) => ({
        ...prev,
        selectedTrackId: trackId,
        activeRegionId:
          trackId !== null
            ? (allRegions.find(
                (r) =>
                  r.trackId === trackId && r.frameIndex === currentFrameIndex,
              )?.id ?? null)
            : null,
      }));
    },
    [allRegions, currentFrameIndex],
  );

  // Classification predictions for current frame (if task === "classification")
  const classificationPredictions = useMemo(() => {
    if (task !== "classification") return [];
    const classDoc = document as unknown as ClassificationResult;
    const frame = classDoc.frames?.[currentFrameIndex] || classDoc.frames?.[0];
    return frame?.predictions || [];
  }, [document, task, currentFrameIndex]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Controls & Metadata Bar */}
      <div className="surface-panel border border-[#252B37] rounded-[8px] p-3 flex flex-wrap items-center justify-between gap-4">
        {/* Task & Model Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold uppercase tracking-wider bg-[#22D3EE]/10 text-[#22D3EE] border border-[#22D3EE]/30">
              {task.replace(/-/g, " ")}
            </span>
            <span className="text-xs font-mono text-[#9AA3B2]">
              {model_variant}
            </span>
            <span className="text-xs font-mono text-[#6B7280]">({mode})</span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-[#6B7280]">
            <span>·</span>
            <span>
              {summary?.inference_duration_ms?.toFixed(1) ?? "0.0"}ms inference
            </span>
            {summary?.cold_start_duration_ms > 0 && (
              <span>
                ({summary.cold_start_duration_ms.toFixed(0)}ms cold start)
              </span>
            )}
          </div>
        </div>

        {/* Filters & Toggles */}
        <div className="flex items-center gap-4 text-xs font-mono">
          {/* Confidence Slider */}
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
            <span>Overlays</span>
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
            <span>Labels</span>
          </label>

          {/* Tracks Toggle (only in tracking mode) */}
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
      </div>

      {/* Main Grid: Left Viewport (65%) | Right Data Table (35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
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
                regions={currentFrameRegions}
                currentFrameIndex={currentFrameIndex}
                mediaUrl={mediaUrl}
                mediaType={media_type}
                options={options}
                onRegionSelect={handleRegionSelect}
                onRegionHover={handleRegionHover}
                className="flex-1 min-h-[440px]"
              />
            )}
          </div>

          {/* Video Scrubber Toolbar (when media is video) */}
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

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-4 flex flex-col">
          {/* Summary Metric Card */}
          <Card className="p-4 bg-[#12151C] border border-[#252B37] rounded-[8px] space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#9AA3B2]">Objects in Frame:</span>
              <span className="text-[#22D3EE] font-bold">
                {currentFrameRegions.length}
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
              <span className="text-[#9AA3B2]">Media Type:</span>
              <span className="text-[#E8EAED] uppercase">{media_type}</span>
            </div>
          </Card>

          {/* Grouped Data Table (outside canvas per R66, KTD8) */}
          {task !== "classification" && (
            <ResultDataTable
              mode={mode}
              regions={currentFrameRegions}
              tracks={trackGroups}
              activeRegionId={options.activeRegionId}
              hoveredRegionId={options.hoveredRegionId}
              selectedTrackId={options.selectedTrackId}
              onRegionSelect={handleRegionSelect}
              onRegionHover={handleRegionHover}
              onTrackSelect={handleTrackSelect}
              className="flex-1"
            />
          )}
        </div>
      </div>
    </div>
  );
}
