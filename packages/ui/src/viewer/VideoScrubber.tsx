"use client";

/**
 * SightForge UI - Video Playback & Frame Scrubber Component (R31, R56)
 */

import React, { useEffect, useState, useRef } from "react";
import { PlayIcon } from "../components/icons";

export interface VideoScrubberProps {
  totalFrames: number;
  currentFrameIndex: number;
  sourceFps?: number;
  sampledFps?: number;
  durationMs?: number;
  onFrameChange: (frameIndex: number) => void;
  className?: string;
}

export function VideoScrubber({
  totalFrames,
  currentFrameIndex,
  sampledFps = 10,
  durationMs = 0,
  onFrameChange,
  className = "",
}: VideoScrubberProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback timer loop
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(33, Math.round(1000 / (sampledFps || 10)));
      intervalRef.current = setInterval(() => {
        onFrameChange((currentFrameIndex + 1) % Math.max(1, totalFrames));
      }, intervalMs);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, currentFrameIndex, totalFrames, sampledFps, onFrameChange]);

  const togglePlay = () => setIsPlaying((prev) => !prev);
  const stepPrev = () => onFrameChange(Math.max(0, currentFrameIndex - 1));
  const stepNext = () =>
    onFrameChange(Math.min(totalFrames - 1, currentFrameIndex + 1));
  const jumpStart = () => onFrameChange(0);
  const jumpEnd = () => onFrameChange(Math.max(0, totalFrames - 1));

  const currentSeconds =
    sampledFps > 0 ? (currentFrameIndex / sampledFps).toFixed(2) : "0.00";
  const totalSeconds =
    durationMs > 0
      ? (durationMs / 1000).toFixed(2)
      : (totalFrames / (sampledFps || 10)).toFixed(2);

  return (
    <div
      role="toolbar"
      aria-label="Video frame navigation"
      className={`bg-[#12151C] border border-[#252B37] rounded-[8px] p-3 space-y-2.5 ${className}`}
    >
      {/* Top Row: Playback Controls & Frame Counters */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {/* Jump to start */}
          <button
            type="button"
            onClick={jumpStart}
            title="Jump to Start"
            className="p-1.5 rounded hover:bg-[#1A1F29] text-[#9AA3B2] hover:text-[#E8EAED] transition-colors font-mono text-xs"
          >
            |◀
          </button>
          {/* Step back */}
          <button
            type="button"
            onClick={stepPrev}
            title="Step Previous Frame"
            className="p-1.5 rounded hover:bg-[#1A1F29] text-[#9AA3B2] hover:text-[#E8EAED] transition-colors font-mono text-xs"
          >
            ◀
          </button>
          {/* Play/Pause */}
          <button
            type="button"
            onClick={togglePlay}
            title={isPlaying ? "Pause" : "Play"}
            className="px-3 py-1 rounded bg-[#1A1F29] border border-[#252B37] hover:border-[#22D3EE] text-[#22D3EE] font-mono text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            {isPlaying ? (
              <span>❚❚ Pause</span>
            ) : (
              <span className="flex items-center gap-1">
                <PlayIcon size={12} /> Play
              </span>
            )}
          </button>
          {/* Step next */}
          <button
            type="button"
            onClick={stepNext}
            title="Step Next Frame"
            className="p-1.5 rounded hover:bg-[#1A1F29] text-[#9AA3B2] hover:text-[#E8EAED] transition-colors font-mono text-xs"
          >
            ▶
          </button>
          {/* Jump to end */}
          <button
            type="button"
            onClick={jumpEnd}
            title="Jump to End"
            className="p-1.5 rounded hover:bg-[#1A1F29] text-[#9AA3B2] hover:text-[#E8EAED] transition-colors font-mono text-xs"
          >
            ▶|
          </button>
        </div>

        {/* Readouts */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="text-[#9AA3B2]">
            <span className="text-[#22D3EE] font-semibold">
              {currentSeconds}s
            </span>
            <span className="text-[#6B7280]"> / {totalSeconds}s</span>
          </div>
          <div className="px-2 py-0.5 rounded bg-[#1A1F29] border border-[#252B37] text-[#E8EAED]">
            Frame{" "}
            <span className="text-[#22D3EE] font-bold">
              {currentFrameIndex + 1}
            </span>{" "}
            / {totalFrames}
          </div>
        </div>
      </div>

      {/* Scrubber Timeline Slider */}
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={currentFrameIndex}
          onChange={(e) => onFrameChange(Number(e.target.value))}
          aria-label="Video frame timeline slider"
          className="w-full h-1.5 bg-[#0A0C10] border border-[#252B37] rounded-lg appearance-none cursor-pointer accent-[#22D3EE] focus:outline-none"
        />
      </div>
    </div>
  );
}
