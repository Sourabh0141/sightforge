"use client";

/**
 * SightForge UI - Grouped Accessible Result Data Table (R66, R73, KTD8)
 */

import React, { useState, useMemo } from "react";
import type { NormalizedRegion, TrackGroup } from "./types";
import { getTrackColor, getClassColor, sanitizeText } from "./palette";

export interface ResultDataTableProps {
  mode: "per-frame" | "tracking";
  regions: NormalizedRegion[];
  tracks?: TrackGroup[];
  activeRegionId: string | null;
  hoveredRegionId: string | null;
  selectedTrackId?: number | null;
  onRegionSelect?: (region: NormalizedRegion | null) => void;
  onRegionHover?: (region: NormalizedRegion | null) => void;
  onTrackSelect?: (trackId: number | null) => void;
  className?: string;
}

export function ResultDataTable({
  mode,
  regions,
  tracks = [],
  activeRegionId,
  hoveredRegionId,
  selectedTrackId,
  onRegionSelect,
  onRegionHover,
  onTrackSelect,
  className = "",
}: ResultDataTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTracks, setExpandedTracks] = useState<Record<number, boolean>>(
    {},
  );

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

  return (
    <div
      role="region"
      aria-label="Detection data table"
      className={`bg-[#12151C] border border-[#252B37] rounded-[8px] flex flex-col overflow-hidden ${className}`}
    >
      {/* Header with Search & Counter */}
      <div className="p-3 border-b border-[#252B37] bg-[#1A1F29]/60 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#E8EAED]">
            {mode === "tracking" ? "Tracked Objects" : "Detected Regions"}
          </h3>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#252B37] text-[#9AA3B2]">
            {mode === "tracking" ? tracks.length : regions.length}
          </span>
        </div>

        {/* Search Filter */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter class or ID..."
            className="w-36 bg-[#0A0C10] border border-[#252B37] rounded-[4px] px-2 py-1 text-xs font-mono text-[#E8EAED] placeholder-[#6B7280] focus:outline-none focus:border-[#22D3EE] transition-colors"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-y-auto max-h-[420px]">
        {mode === "tracking" ? (
          /* TRACKING MODE (Grouped by Track ID per KTD8) */
          <div className="divide-y divide-[#252B37]">
            {filteredTracks.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-[#6B7280]">
                No tracked objects match the filter.
              </div>
            ) : (
              filteredTracks.map((track) => {
                const isSelected = selectedTrackId === track.trackId;
                const isExpanded = !!expandedTracks[track.trackId];
                const trackColor = getTrackColor(track.trackId);
                const avgPct = (track.confidenceAvg * 100).toFixed(1);

                return (
                  <div
                    key={track.trackId}
                    className={`transition-colors ${
                      isSelected
                        ? "bg-[#22D3EE]/10 border-l-2 border-l-[#22D3EE]"
                        : "hover:bg-[#1A1F29]/40"
                    }`}
                  >
                    {/* Summary Row */}
                    <div
                      onClick={() =>
                        onTrackSelect?.(isSelected ? null : track.trackId)
                      }
                      onMouseEnter={() => {
                        const firstObs = regions.find(
                          (r) => r.trackId === track.trackId,
                        );
                        if (firstObs) onRegionHover?.(firstObs);
                      }}
                      onMouseLeave={() => onRegionHover?.(null)}
                      className="p-3 flex items-center justify-between cursor-pointer gap-2 select-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: trackColor }}
                        />
                        <span className="font-mono text-xs font-semibold text-[#22D3EE]">
                          #{track.trackId}
                        </span>
                        <span className="font-mono text-xs text-[#E8EAED] capitalize truncate">
                          {sanitizeText(track.className)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-2 w-28">
                          <span className="font-mono text-[11px] text-[#9AA3B2] w-10 text-right">
                            {avgPct}%
                          </span>
                          <div className="flex-1 h-1 bg-[#0A0C10] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, track.confidenceAvg * 100)}%`,
                                backgroundColor: trackColor,
                              }}
                            />
                          </div>
                        </div>

                        <span className="font-mono text-[10px] text-[#6B7280]">
                          {track.totalObservations} frames
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTrackExpand(track.trackId);
                          }}
                          className="text-[10px] font-mono text-[#9AA3B2] hover:text-[#E8EAED] px-1.5 py-0.5 rounded border border-[#252B37] bg-[#12151C]"
                        >
                          {isExpanded ? "Hide" : "Details"}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Observations Sub-Table */}
                    {isExpanded && (
                      <div className="px-4 py-2 bg-[#0A0C10]/60 border-t border-[#252B37]/60">
                        <table className="w-full text-left font-mono text-[11px]">
                          <thead>
                            <tr className="text-[#6B7280] text-[10px] uppercase">
                              <th className="py-1">Frame</th>
                              <th className="py-1">Timestamp</th>
                              <th className="py-1">Confidence</th>
                              <th className="py-1 text-right">
                                Box [x, y, w, h]
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#252B37]/40">
                            {track.observations.map((obs) => (
                              <tr
                                key={obs.frameIndex}
                                className="text-[#9AA3B2] hover:text-[#E8EAED]"
                              >
                                <td className="py-1 text-[#22D3EE]">
                                  F{obs.frameIndex}
                                </td>
                                <td className="py-1">
                                  {(obs.timestampMs / 1000).toFixed(2)}s
                                </td>
                                <td className="py-1">
                                  {(obs.confidence * 100).toFixed(0)}%
                                </td>
                                <td className="py-1 text-right text-[#6B7280]">
                                  [
                                  {obs.box.map((v) => Math.round(v)).join(", ")}
                                  ]
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* PER-FRAME MODE (Flat Active Detections) */
          <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 bg-[#1A1F29] border-b border-[#252B37] text-[10px] uppercase text-[#9AA3B2]">
              <tr>
                <th className="py-2.5 px-3 font-normal">Class</th>
                <th className="py-2.5 px-3 font-normal w-32">Confidence</th>
                <th className="py-2.5 px-3 font-normal text-right">
                  Bounding Box
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#252B37]">
              {filteredRegions.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="p-6 text-center text-xs text-[#6B7280]"
                  >
                    No detections match the current threshold/filter.
                  </td>
                </tr>
              ) : (
                filteredRegions.map((region) => {
                  const isSelected = activeRegionId === region.id;
                  const isHovered = hoveredRegionId === region.id;
                  const color =
                    region.trackId !== undefined
                      ? getTrackColor(region.trackId)
                      : getClassColor(region.classId);
                  const pct = (region.confidence * 100).toFixed(0);

                  return (
                    <tr
                      key={region.id}
                      onClick={() =>
                        onRegionSelect?.(isSelected ? null : region)
                      }
                      onMouseEnter={() => onRegionHover?.(region)}
                      onMouseLeave={() => onRegionHover?.(null)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#22D3EE]/10 border-l-2 border-l-[#22D3EE]"
                          : isHovered
                            ? "bg-[#1A1F29]/60"
                            : "hover:bg-[#1A1F29]/30"
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-[#E8EAED] font-medium capitalize">
                            {sanitizeText(region.className)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-right text-[#9AA3B2]">
                            {pct}%
                          </span>
                          <div className="flex-1 h-1 bg-[#0A0C10] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, region.confidence * 100)}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#6B7280]">
                        {region.rbox ? (
                          <span>
                            [
                            {region.rbox
                              .slice(0, 4)
                              .map((v) => Math.round(v))
                              .join(",")}
                            , {region.rbox[4].toFixed(0)}°]
                          </span>
                        ) : (
                          <span>
                            [{region.box.map((v) => Math.round(v)).join(", ")}]
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
