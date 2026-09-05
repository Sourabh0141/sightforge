"use client";

/**
 * SightForge UI - Grouped Accessible Result Data Table (R66, R73, KTD4, KTD8)
 *
 * Provides structured accessible data tables outside the canvas for:
 * - Sparse detections & tracks (grouped by track or per-frame list).
 * - Semantic segmentation (per-class coverage share, palette swatch with pattern, occupied sectors).
 * - Depth estimation (distribution bands, metric depth ranges, coarse 3x3 spatial grid).
 */

import React, { useState, useMemo } from "react";
import type {
  NormalizedRegion,
  TrackGroup,
  SemanticClassSummary,
  DepthSpatialSummary,
} from "./types";
import { getTrackColor, getClassColor, sanitizeText } from "./palette";

export interface ResultDataTableProps {
  mode?: "per-frame" | "tracking";
  regions?: NormalizedRegion[];
  tracks?: TrackGroup[];
  // Dense summary props (KTD4, R66)
  semanticSummaries?: SemanticClassSummary[];
  depthSummary?: DepthSpatialSummary | null;
  // Interaction states & callbacks
  activeRegionId?: string | null;
  hoveredRegionId?: string | null;
  selectedTrackId?: number | null;
  selectedClassIds?: number[];
  onRegionSelect?: (region: NormalizedRegion | null) => void;
  onRegionHover?: (region: NormalizedRegion | null) => void;
  onTrackSelect?: (trackId: number | null) => void;
  onClassSelect?: (classId: number | null) => void;
  className?: string;
}

export function ResultDataTable({
  mode = "per-frame",
  regions = [],
  tracks = [],
  semanticSummaries,
  depthSummary,
  activeRegionId,
  hoveredRegionId,
  selectedTrackId,
  selectedClassIds = [],
  onRegionSelect,
  onRegionHover,
  onTrackSelect,
  onClassSelect,
  className = "",
}: ResultDataTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTracks, setExpandedTracks] = useState<Record<number, boolean>>(
    {},
  );

  const isDenseSemantic = Boolean(
    semanticSummaries && semanticSummaries.length > 0,
  );
  const isDenseDepth = Boolean(depthSummary);

  const toggleTrackExpand = (trackId: number) => {
    setExpandedTracks((prev) => ({
      ...prev,
      [trackId]: !prev[trackId],
    }));
  };

  // Filtered tracks for tracking mode
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.className.toLowerCase().includes(q) || String(t.trackId).includes(q),
    );
  }, [tracks, searchQuery]);

  // Filtered regions for per-frame mode
  const filteredRegions = useMemo(() => {
    if (!searchQuery.trim()) return regions;
    const q = searchQuery.toLowerCase();
    return regions.filter(
      (r) =>
        r.className.toLowerCase().includes(q) ||
        (r.trackId !== undefined && String(r.trackId).includes(q)),
    );
  }, [regions, searchQuery]);

  // Filtered semantic classes
  const filteredSemantic = useMemo(() => {
    if (!semanticSummaries) return [];
    if (!searchQuery.trim()) return semanticSummaries;
    const q = searchQuery.toLowerCase();
    return semanticSummaries.filter(
      (s) =>
        s.className.toLowerCase().includes(q) || String(s.classId).includes(q),
    );
  }, [semanticSummaries, searchQuery]);

  return (
    <div
      className={`bg-[#12151C] border border-[#252B37] rounded-[8px] flex flex-col max-h-[560px] overflow-hidden ${className}`}
    >
      {/* Header with search */}
      <div className="p-3 border-b border-[#252B37] flex items-center justify-between gap-3 bg-[#161A23]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#E8EAED]">
            {isDenseSemantic
              ? "Class Coverage Table"
              : isDenseDepth
                ? "Depth Spatial Distribution"
                : mode === "tracking"
                  ? "Track Summary Table"
                  : "Detected Objects Table"}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0A0C10] border border-[#252B37] text-[#22D3EE]">
            {isDenseSemantic
              ? `${filteredSemantic.length} classes`
              : isDenseDepth
                ? `${depthSummary?.bands.length || 0} bands`
                : mode === "tracking"
                  ? `${filteredTracks.length} tracks`
                  : `${filteredRegions.length} in frame`}
          </span>
        </div>

        {/* Search input for large tables */}
        {!isDenseDepth && (
          <input
            type="text"
            placeholder="Filter table..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs bg-[#0A0C10] border border-[#252B37] rounded px-2 py-1 text-[#E8EAED] placeholder-[#64748B] focus:outline-none focus:border-[#22D3EE] w-32 sm:w-40"
          />
        )}
      </div>

      {/* Accessible Table Container */}
      <div className="overflow-y-auto flex-1 p-2 space-y-2">
        {/* =========================================================================
            DENSE 1: SEMANTIC SEGMENTATION CLASS TABLE (KTD4, R63, R66)
            ========================================================================= */}
        {isDenseSemantic && (
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-[#252B37] text-[#9AA3B2]">
                <th className="py-2 px-2.5 font-medium">Class / ID</th>
                <th className="py-2 px-2.5 font-medium text-right">
                  Coverage %
                </th>
                <th className="py-2 px-2.5 font-medium">Occupied Sectors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1F29]">
              {filteredSemantic.map((item) => {
                const isSelected =
                  selectedClassIds.length === 0 ||
                  selectedClassIds.includes(item.classId);

                return (
                  <tr
                    key={item.classId}
                    onClick={() => onClassSelect?.(item.classId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "hover:bg-[#1A1F29]/80 text-[#E8EAED]"
                        : "opacity-40 hover:opacity-80 text-[#9AA3B2]"
                    }`}
                  >
                    <td className="py-2 px-2.5 flex items-center gap-2">
                      {/* Dual-encoded color swatch + pattern border (R63) */}
                      <span
                        className="w-3.5 h-3.5 rounded border border-white/80 shrink-0"
                        style={{ backgroundColor: item.hexColor }}
                      />
                      <span className="font-semibold">
                        {sanitizeText(item.className)}
                      </span>
                      <span className="text-[10px] text-[#64748B]">
                        #{item.classId}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-right font-bold text-[#22D3EE]">
                      {item.coveragePercent.toFixed(1)}%
                    </td>
                    <td className="py-2 px-2.5 text-[11px] text-[#9AA3B2]">
                      {item.occupiedSectors.join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* =========================================================================
            DENSE 2: DEPTH ESTIMATION BANDS & 3X3 SPATIAL GRID (KTD4, R55, R66)
            ========================================================================= */}
        {isDenseDepth && depthSummary && (
          <div className="space-y-4">
            {/* Metric Range Header Card */}
            <div className="p-3 bg-[#0A0C10] border border-[#252B37] rounded-[6px] space-y-1 text-xs font-mono">
              <div className="flex justify-between items-center text-[#9AA3B2]">
                <span>Near Depth ({depthSummary.unit}):</span>
                <span className="text-[#22D3EE] font-bold">
                  {depthSummary.minDepthMeters.toFixed(2)} m
                </span>
              </div>
              <div className="flex justify-between items-center text-[#9AA3B2]">
                <span>Median Depth:</span>
                <span className="text-[#E8EAED] font-bold">
                  {depthSummary.medianDepthMeters.toFixed(2)} m
                </span>
              </div>
              <div className="flex justify-between items-center text-[#9AA3B2]">
                <span>Far Depth ({depthSummary.unit}):</span>
                <span className="text-[#A78BFA] font-bold">
                  {depthSummary.maxDepthMeters.toFixed(2)} m
                </span>
              </div>
            </div>

            {/* Depth Distribution Bands Table */}
            <div>
              <div className="text-[11px] font-semibold text-[#9AA3B2] uppercase tracking-wider mb-1.5 px-1">
                Depth Distribution Bands
              </div>
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-[#252B37] text-[#9AA3B2]">
                    <th className="py-1.5 px-2 font-medium">Band</th>
                    <th className="py-1.5 px-2 font-medium">Metric Range</th>
                    <th className="py-1.5 px-2 font-medium text-right">
                      Coverage %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1F29]">
                  {depthSummary.bands.map((band) => (
                    <tr key={band.category} className="hover:bg-[#1A1F29]/60">
                      <td className="py-2 px-2 flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            band.category === "foreground"
                              ? "bg-[#22D3EE]"
                              : band.category === "midground"
                                ? "bg-[#34D399]"
                                : "bg-[#A78BFA]"
                          }`}
                        />
                        <span className="font-semibold text-[#E8EAED]">
                          {band.label}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-[#9AA3B2]">
                        {band.minDepthMeters.toFixed(1)}m –{" "}
                        {band.maxDepthMeters.toFixed(1)}m
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-[#22D3EE]">
                        {band.coveragePercent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Coarse 3x3 Spatial Grid Overview (KTD4) */}
            <div>
              <div className="text-[11px] font-semibold text-[#9AA3B2] uppercase tracking-wider mb-2 px-1">
                3×3 Coarse Spatial Depth Grid
              </div>
              <div className="grid grid-cols-3 gap-1.5 font-mono text-center">
                {depthSummary.spatialGrid.map((sector) => (
                  <div
                    key={sector.sectorName}
                    className="p-2 bg-[#0A0C10] border border-[#252B37] rounded-[4px] flex flex-col items-center justify-center space-y-0.5"
                  >
                    <span className="text-[10px] text-[#64748B]">
                      {sector.sectorName}
                    </span>
                    <span className="text-xs font-bold text-[#E8EAED]">
                      {sector.avgDepthMeters.toFixed(1)}m
                    </span>
                    <span
                      className={`text-[9px] uppercase px-1 rounded ${
                        sector.category === "foreground"
                          ? "text-[#22D3EE] bg-[#22D3EE]/10"
                          : sector.category === "midground"
                            ? "text-[#34D399] bg-[#34D399]/10"
                            : "text-[#A78BFA] bg-[#A78BFA]/10"
                      }`}
                    >
                      {sector.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            SPARSE 1: TRACKING MODE TABLE (Grouped by Track ID per KTD8)
            ========================================================================= */}
        {!isDenseSemantic && !isDenseDepth && mode === "tracking" && (
          <div className="space-y-2">
            {filteredTracks.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#64748B] font-mono">
                No active tracks found matching query.
              </div>
            ) : (
              filteredTracks.map((track) => {
                const isSelected = selectedTrackId === track.trackId;
                const isExpanded = expandedTracks[track.trackId];
                const trackColor = getTrackColor(track.trackId);

                return (
                  <div
                    key={track.trackId}
                    className={`border rounded-[6px] overflow-hidden transition-all ${
                      isSelected
                        ? "border-[#22D3EE] bg-[#161A23]"
                        : "border-[#252B37] bg-[#0A0C10]/60 hover:border-[#384152]"
                    }`}
                  >
                    {/* Track Summary Header */}
                    <div
                      onClick={() =>
                        onTrackSelect?.(isSelected ? null : track.trackId)
                      }
                      className="p-2.5 flex items-center justify-between gap-2 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 border border-black"
                          style={{ backgroundColor: trackColor }}
                        />
                        <span className="text-xs font-mono font-bold text-[#E8EAED]">
                          Track #{track.trackId}
                        </span>
                        <span className="text-xs font-mono text-[#9AA3B2]">
                          ({sanitizeText(track.className)})
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-mono text-[#22D3EE]">
                          Avg: {Math.round(track.confidenceAvg * 100)}%
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#12151C] text-[#9AA3B2]">
                          {track.totalObservations} frames
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTrackExpand(track.trackId);
                          }}
                          className="text-[#64748B] hover:text-[#E8EAED] text-xs px-1"
                        >
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Per-Frame Observation List */}
                    {isExpanded && (
                      <div className="border-t border-[#252B37] bg-[#12151C]/80 p-2 space-y-1">
                        <div className="text-[10px] font-mono text-[#64748B] pb-1 grid grid-cols-3 px-2">
                          <span>Frame Index</span>
                          <span>Timestamp</span>
                          <span className="text-right">Confidence</span>
                        </div>
                        {track.observations.map((obs) => {
                          const regId = `trk_${track.trackId}_f${obs.frameIndex}`;
                          const isRegActive = activeRegionId === regId;
                          const isRegHovered = hoveredRegionId === regId;

                          return (
                            <div
                              key={obs.frameIndex}
                              onMouseEnter={() =>
                                onRegionHover?.({
                                  id: regId,
                                  task: "detection",
                                  frameIndex: obs.frameIndex,
                                  classId: track.classId,
                                  className: track.className,
                                  confidence: obs.confidence,
                                  box: obs.box,
                                  trackId: track.trackId,
                                })
                              }
                              onMouseLeave={() => onRegionHover?.(null)}
                              onClick={() =>
                                onRegionSelect?.({
                                  id: regId,
                                  task: "detection",
                                  frameIndex: obs.frameIndex,
                                  classId: track.classId,
                                  className: track.className,
                                  confidence: obs.confidence,
                                  box: obs.box,
                                  trackId: track.trackId,
                                })
                              }
                              className={`grid grid-cols-3 px-2 py-1 rounded text-xs font-mono cursor-pointer transition-colors ${
                                isRegActive
                                  ? "bg-[#22D3EE]/20 text-[#22D3EE] font-bold"
                                  : isRegHovered
                                    ? "bg-[#1A1F29] text-[#E8EAED]"
                                    : "text-[#9AA3B2] hover:bg-[#1A1F29]/60"
                              }`}
                            >
                              <span>Frame #{obs.frameIndex}</span>
                              <span>{obs.timestampMs} ms</span>
                              <span className="text-right">
                                {Math.round(obs.confidence * 100)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* =========================================================================
            SPARSE 2: PER-FRAME DETECTIONS TABLE
            ========================================================================= */}
        {!isDenseSemantic && !isDenseDepth && mode === "per-frame" && (
          <div className="space-y-1.5">
            {filteredRegions.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#64748B] font-mono">
                No objects in current frame.
              </div>
            ) : (
              filteredRegions.map((reg) => {
                const isActive = activeRegionId === reg.id;
                const isHovered = hoveredRegionId === reg.id;
                const classColor = getClassColor(reg.classId);

                return (
                  <div
                    key={reg.id}
                    onMouseEnter={() => onRegionHover?.(reg)}
                    onMouseLeave={() => onRegionHover?.(null)}
                    onClick={() => onRegionSelect?.(isActive ? null : reg)}
                    className={`p-2.5 rounded-[6px] border text-xs font-mono flex items-center justify-between cursor-pointer transition-all ${
                      isActive
                        ? "border-[#22D3EE] bg-[#161A23] text-[#E8EAED]"
                        : isHovered
                          ? "border-[#384152] bg-[#1A1F29] text-[#E8EAED]"
                          : "border-[#252B37] bg-[#0A0C10]/60 text-[#9AA3B2] hover:border-[#384152]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-black"
                        style={{ backgroundColor: classColor }}
                      />
                      <span className="font-semibold text-[#E8EAED]">
                        {sanitizeText(reg.className)}
                      </span>
                      <span className="text-[10px] text-[#64748B]">
                        #{reg.classId}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[#22D3EE] font-bold">
                        {Math.round(reg.confidence * 100)}%
                      </span>
                      <span className="text-[10px] text-[#64748B]">
                        [{Math.round(reg.box[0])},{Math.round(reg.box[1])}]
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
