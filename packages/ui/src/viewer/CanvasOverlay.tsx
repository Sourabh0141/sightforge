"use client";

/**
 * SightForge UI - Interactive Canvas Overlay Component (R55, R56, R62, R63, R64, R65, KTD3)
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { NormalizedRegion, ViewerDisplayOptions } from "./types";
import { createHatchPatternCanvas, sanitizeText } from "./palette";
import {
  renderDetectionInstance,
  renderObbInstance,
  renderPoseInstance,
  renderInstanceSegmentation,
  renderTrackingTrajectory,
} from "./renderers";

export interface CanvasOverlayProps {
  regions: NormalizedRegion[];
  currentFrameIndex?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  options: ViewerDisplayOptions;
  onRegionSelect?: (region: NormalizedRegion | null) => void;
  onRegionHover?: (region: NormalizedRegion | null) => void;
  className?: string;
}

export function CanvasOverlay({
  regions,
  currentFrameIndex = 0,
  sourceWidth = 1920,
  sourceHeight = 1080,
  mediaUrl,
  mediaType = "image",
  options,
  onRegionSelect,
  onRegionHover,
  className = "",
}: CanvasOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const patternCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  }>({
    width: 800,
    height: 450,
  });

  // Initialize hatch pattern once
  useEffect(() => {
    patternCanvasRef.current = createHatchPatternCanvas();
  }, []);

  // Filter visible regions based on confidence & class filter
  const visibleRegions = useMemo(() => {
    return regions.filter((r) => {
      if (r.confidence < options.minConfidence) return false;
      if (
        options.selectedClassIds.length > 0 &&
        !options.selectedClassIds.includes(r.classId)
      ) {
        return false;
      }
      return true;
    });
  }, [regions, options.minConfidence, options.selectedClassIds]);

  // Active region index for roving focus in reading order (top-to-bottom, left-to-right)
  const sortedRegionsForA11y = useMemo(() => {
    return [...visibleRegions].sort((a, b) => {
      const [ax, ay] = a.box;
      const [bx, by] = b.box;
      if (Math.abs(ay - by) > 20) return ay - by;
      return ax - bx;
    });
  }, [visibleRegions]);

  const activeIndex = useMemo(() => {
    if (!options.activeRegionId) return -1;
    return sortedRegionsForA11y.findIndex(
      (r) => r.id === options.activeRegionId,
    );
  }, [options.activeRegionId, sortedRegionsForA11y]);

  // Resize observer to track container dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Calculate image placement scale to fit container while preserving aspect ratio
  const renderMetrics = useMemo(() => {
    const srcAspect = sourceWidth / (sourceHeight || 1);
    const contAspect = containerSize.width / (containerSize.height || 1);

    let drawWidth = containerSize.width;
    let drawHeight = containerSize.height;
    let offsetX = 0;
    let offsetY = 0;

    if (contAspect > srcAspect) {
      // Container is wider than image: fit height
      drawHeight = containerSize.height;
      drawWidth = drawHeight * srcAspect;
      offsetX = (containerSize.width - drawWidth) / 2;
    } else {
      // Container is taller than image: fit width
      drawWidth = containerSize.width;
      drawHeight = drawWidth / srcAspect;
      offsetY = (containerSize.height - drawHeight) / 2;
    }

    const scaleX = drawWidth / sourceWidth;
    const scaleY = drawHeight / sourceHeight;

    return { drawWidth, drawHeight, offsetX, offsetY, scaleX, scaleY };
  }, [containerSize, sourceWidth, sourceHeight]);

  // Draw overlay canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const { width, height } = containerSize;

    // Set backing store dimensions
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!options.showOverlays) {
      ctx.restore();
      return;
    }

    const { offsetX, offsetY, scaleX, scaleY } = renderMetrics;

    // Apply viewport translation and scale
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scaleX, scaleY);

    const hasActiveOrHover = Boolean(
      options.activeRegionId || options.hoveredRegionId,
    );

    // 1. Draw tracking trajectories first (behind boxes)
    for (const region of visibleRegions) {
      const isSelected = region.id === options.activeRegionId;
      const isHovered = region.id === options.hoveredRegionId;
      const isDimmed = hasActiveOrHover && !isSelected && !isHovered;

      renderTrackingTrajectory(
        ctx,
        region,
        currentFrameIndex,
        options,
        isSelected,
        isHovered,
        isDimmed,
      );
    }

    // 2. Draw task-specific regions
    for (const region of visibleRegions) {
      const isSelected = region.id === options.activeRegionId;
      const isHovered = region.id === options.hoveredRegionId;
      const isDimmed = hasActiveOrHover && !isSelected && !isHovered;

      switch (region.task) {
        case "detection":
          renderDetectionInstance(
            ctx,
            region,
            options,
            isSelected,
            isHovered,
            isDimmed,
          );
          break;
        case "obb":
          renderObbInstance(
            ctx,
            region,
            options,
            isSelected,
            isHovered,
            isDimmed,
          );
          break;
        case "pose":
          renderPoseInstance(
            ctx,
            region,
            options,
            isSelected,
            isHovered,
            isDimmed,
          );
          break;
        case "instance-segmentation":
          renderInstanceSegmentation(
            ctx,
            region,
            options,
            patternCanvasRef.current,
            isSelected,
            isHovered,
            isDimmed,
          );
          break;
        default:
          renderDetectionInstance(
            ctx,
            region,
            options,
            isSelected,
            isHovered,
            isDimmed,
          );
          break;
      }
    }

    ctx.restore();
    ctx.restore();
  }, [
    containerSize,
    options,
    renderMetrics,
    visibleRegions,
    currentFrameIndex,
  ]);

  // Request Animation Frame render scheduler
  useEffect(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      draw();
    });
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [draw]);

  // Pointer Hit-Testing
  const getRegionAtPoint = useCallback(
    (clientX: number, clientY: number): NormalizedRegion | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;

      const { offsetX, offsetY, scaleX, scaleY } = renderMetrics;
      // Convert to image coordinates
      const imgX = (clickX - offsetX) / scaleX;
      const imgY = (clickY - offsetY) / scaleY;

      // Find region whose box contains point, checking smallest boxes first (top-most)
      const matches = visibleRegions.filter((r) => {
        const [x, y, w, h] = r.box;
        return imgX >= x && imgX <= x + w && imgY >= y && imgY <= y + h;
      });

      if (matches.length === 0) return null;
      matches.sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3]);
      return matches[0] ?? null;
    },
    [renderMetrics, visibleRegions],
  );

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const region = getRegionAtPoint(e.clientX, e.clientY);
    onRegionHover?.(region);
  };

  const handlePointerLeave = () => {
    onRegionHover?.(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const region = getRegionAtPoint(e.clientX, e.clientY);
    onRegionSelect?.(region);
  };

  // Keyboard navigation for accessible listbox (R62)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (sortedRegionsForA11y.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      const nextIdx = (activeIndex + 1) % sortedRegionsForA11y.length;
      onRegionSelect?.(sortedRegionsForA11y[nextIdx] ?? null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIdx =
        (activeIndex - 1 + sortedRegionsForA11y.length) %
        sortedRegionsForA11y.length;
      onRegionSelect?.(sortedRegionsForA11y[prevIdx] ?? null);
    } else if (e.key === "Home") {
      e.preventDefault();
      onRegionSelect?.(sortedRegionsForA11y[0] ?? null);
    } else if (e.key === "End") {
      e.preventDefault();
      onRegionSelect?.(
        sortedRegionsForA11y[sortedRegionsForA11y.length - 1] ?? null,
      );
    } else if (e.key === "Escape") {
      e.preventDefault();
      onRegionSelect?.(null);
    }
  };

  const activeRegion =
    activeIndex >= 0 ? sortedRegionsForA11y[activeIndex] : null;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center bg-[#0A0C10] select-none overflow-hidden ${className}`}
    >
      {/* Background Media Element */}
      {mediaUrl && mediaType === "image" && (
        <img
          src={mediaUrl}
          alt="Source media for vision task"
          className="absolute max-w-full max-h-full object-contain pointer-events-none"
          style={{
            width: renderMetrics.drawWidth,
            height: renderMetrics.drawHeight,
          }}
        />
      )}

      {/* Interactive Overlay Canvas */}
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        className="absolute inset-0 w-full h-full cursor-crosshair z-10"
        style={{
          width: containerSize.width,
          height: containerSize.height,
        }}
      />

      {/* Accessible Fallback Tree (R62) - One composite listbox widget */}
      <div
        ref={listboxRef}
        role="listbox"
        tabIndex={0}
        aria-label="Detected visual regions in image"
        aria-activedescendant={activeRegion ? activeRegion.id : undefined}
        onKeyDown={handleKeyDown}
        className="sr-only focus:not-sr-only focus:absolute focus:bottom-2 focus:left-2 focus:z-30 focus:p-2 focus:bg-[#12151C] focus:border focus:border-[#22D3EE] focus:rounded focus:text-xs focus:font-mono focus:text-[#E8EAED]"
      >
        <span className="text-[11px] text-[#22D3EE] block mb-1">
          Region Layer (Use Arrow keys to navigate, Esc to deselect)
        </span>
        {sortedRegionsForA11y.map((region) => {
          const isSelected = region.id === options.activeRegionId;
          const trackText =
            region.trackId !== undefined ? `Track ${region.trackId}, ` : "";
          const confidenceText = `${Math.round(region.confidence * 100)}% confidence`;
          const posText = `at [${region.box.map((v) => Math.round(v)).join(", ")}]`;
          const accessibleLabel = `${trackText}${sanitizeText(region.className)}, ${confidenceText}, ${posText}`;

          return (
            <div
              key={region.id}
              id={region.id}
              role="option"
              aria-selected={isSelected}
              className={`p-1 rounded ${isSelected ? "bg-[#22D3EE]/20 font-bold" : ""}`}
            >
              {accessibleLabel}
            </div>
          );
        })}
      </div>
    </div>
  );
}
