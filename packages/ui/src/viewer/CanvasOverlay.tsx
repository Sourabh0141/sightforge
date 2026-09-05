"use client";

/**
 * SightForge UI - Interactive Canvas Overlay Component (R55, R56, R58, R62, R63, R64, R65, KTD3, KTD4)
 *
 * Coordinates:
 * - Sparse vector renderers (Detection, OBB, Pose, Instance Seg, Tracking).
 * - Dense continuous raster overlays (Semantic Segmentation, Depth Estimation).
 * - Artifact image loading, caching, and resolution mapping.
 * - Interactive cursor depth probe & roving focus accessibility.
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import type {
  NormalizedRegion,
  ViewerDisplayOptions,
  ArtifactResolver,
  AllTaskType,
} from "./types";
import type {
  SemanticSegmentationColorMapping,
  DepthMetadata,
} from "@sightforge/contracts";
import { createHatchPatternCanvas, sanitizeText } from "./palette";
import {
  renderDetectionInstance,
  renderObbInstance,
  renderPoseInstance,
  renderInstanceSegmentation,
  renderTrackingTrajectory,
  drawSemanticSegmentationOverlay,
  drawDepthOverlay,
} from "./renderers";

export interface CanvasOverlayProps {
  task?: AllTaskType;
  regions?: NormalizedRegion[];
  currentFrameIndex?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  // Dense artifact & metadata props (R50, R55, KTD4)
  artifactKey?: string;
  resolveArtifact?: ArtifactResolver;
  semanticPalette?: SemanticSegmentationColorMapping[];
  depthMetadata?: DepthMetadata;
  accessibleDescription?: string;
  // Options & callbacks
  options: ViewerDisplayOptions;
  onRegionSelect?: (region: NormalizedRegion | null) => void;
  onRegionHover?: (region: NormalizedRegion | null) => void;
  className?: string;
}

export function CanvasOverlay({
  task = "detection",
  regions = [],
  currentFrameIndex = 0,
  sourceWidth = 1920,
  sourceHeight = 1080,
  mediaUrl,
  mediaType = "image",
  artifactKey,
  resolveArtifact,
  semanticPalette = [],
  depthMetadata,
  accessibleDescription,
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

  // Cached decoded artifact image for dense tasks
  const [artifactImage, setArtifactImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [probeCoords, setProbeCoords] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  }>({
    width: 800,
    height: 450,
  });

  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Load and decode dense artifact when artifactKey or currentFrameIndex changes (R50, R58)
  useEffect(() => {
    if (!artifactKey) {
      setArtifactImage(null);
      setArtifactError(null);
      return;
    }

    let isCancelled = false;
    setArtifactError(null);

    const loadArtifact = async () => {
      try {
        let url = artifactKey;
        if (resolveArtifact) {
          url = await resolveArtifact(artifactKey, currentFrameIndex);
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;

        await img.decode();
        if (!isCancelled) {
          setArtifactImage(img);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.warn("Failed to load dense artifact:", err);
          setArtifactError(
            "Dense artifact image is unavailable or retention window expired.",
          );
        }
      }
    };

    loadArtifact();

    return () => {
      isCancelled = true;
    };
  }, [artifactKey, currentFrameIndex, resolveArtifact]);

  // Create hatch pattern canvas once
  useEffect(() => {
    patternCanvasRef.current = createHatchPatternCanvas();
  }, []);

  // Filter regions by confidence & class
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

  // Sort regions in spatial reading order (top-to-bottom, left-to-right) for a11y (R62)
  const accessibleRegions = useMemo(() => {
    return [...visibleRegions].sort((a, b) => {
      const topDiff = a.box[1] - b.box[1];
      if (Math.abs(topDiff) > 20) return topDiff;
      return a.box[0] - b.box[0];
    });
  }, [visibleRegions]);

  // Resize observer to keep canvas DPI scaled to container
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

  // Main Render Loop coalesced via requestAnimationFrame
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = containerSize;

    // Adjust canvas buffer size for high-DPI displays
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const transform = { zoom: 1.0, panX: 0, panY: 0 };
    const pattern = patternCanvasRef.current;

    // =======================================================================
    // 1. DENSE TASK OVERLAYS (Semantic Segmentation & Depth)
    // =======================================================================
    if (task === "semantic-segmentation" && artifactImage) {
      drawSemanticSegmentationOverlay({
        ctx,
        maskImage: artifactImage,
        colorPalette: semanticPalette,
        imgWidth: sourceWidth,
        imgHeight: sourceHeight,
        canvasWidth: width,
        canvasHeight: height,
        options,
        transform,
      });
    } else if (task === "depth" && depthMetadata) {
      drawDepthOverlay({
        ctx,
        depthImage: artifactImage,
        metadata: depthMetadata,
        imgWidth: sourceWidth,
        imgHeight: sourceHeight,
        canvasWidth: width,
        canvasHeight: height,
        options,
        transform,
        probeCoords,
      });
    }

    // =======================================================================
    // 2. SPARSE VECTOR OVERLAYS (Detection, OBB, Pose, Instance Seg, Tracking)
    // =======================================================================
    if (options.showOverlays && visibleRegions.length > 0) {
      // Pass 1: Render tracking trajectory polylines behind bounding boxes
      if (options.showTracks) {
        for (const reg of visibleRegions) {
          if (reg.trajectory && reg.trajectory.length > 1) {
            const isSelected = options.activeRegionId === reg.id;
            const isHovered = options.hoveredRegionId === reg.id;
            const isDimmed =
              Boolean(
                options.activeRegionId && options.activeRegionId !== reg.id,
              ) ||
              Boolean(
                options.selectedTrackId !== null &&
                reg.trackId !== undefined &&
                options.selectedTrackId !== reg.trackId,
              );

            renderTrackingTrajectory(
              ctx,
              reg,
              currentFrameIndex,
              options,
              isSelected,
              isHovered,
              isDimmed,
            );
          }
        }
      }

      // Pass 2: Render foreground region instances
      for (const reg of visibleRegions) {
        const isSelected = options.activeRegionId === reg.id;
        const isHovered = options.hoveredRegionId === reg.id;
        const isDimmed =
          Boolean(
            options.activeRegionId && options.activeRegionId !== reg.id,
          ) ||
          Boolean(
            options.selectedTrackId !== null &&
            reg.trackId !== undefined &&
            options.selectedTrackId !== reg.trackId,
          );

        if (reg.task === "detection") {
          renderDetectionInstance(
            ctx,
            reg,
            options,
            isSelected,
            isHovered,
            isDimmed,
          );
        } else if (reg.task === "obb") {
          renderObbInstance(ctx, reg, options, isSelected, isHovered, isDimmed);
        } else if (reg.task === "pose") {
          renderPoseInstance(
            ctx,
            reg,
            options,
            isSelected,
            isHovered,
            isDimmed,
          );
        } else if (reg.task === "instance-segmentation") {
          renderInstanceSegmentation(
            ctx,
            reg,
            options,
            pattern,
            isSelected,
            isHovered,
            isDimmed,
          );
        }
      }
    }

    ctx.restore();
  }, [
    containerSize,
    task,
    artifactImage,
    semanticPalette,
    depthMetadata,
    probeCoords,
    visibleRegions,
    options,
    sourceWidth,
    sourceHeight,
    currentFrameIndex,
  ]);

  // Request Animation Frame coalescing
  useEffect(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(renderCanvas);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [renderCanvas]);

  // Pointer hit testing for sparse regions & cursor depth probe
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // For depth task, track probe coordinates
    if (task === "depth") {
      setProbeCoords({ x: clientX, y: clientY });
    }

    if (visibleRegions.length === 0) return;

    const scaleX = sourceWidth / containerSize.width;
    const scaleY = sourceHeight / containerSize.height;
    const imgX = clientX * scaleX;
    const imgY = clientY * scaleY;

    // Hit test reverse order (topmost first)
    for (let i = visibleRegions.length - 1; i >= 0; i--) {
      const reg = visibleRegions[i]!;
      const [bx, by, bw, bh] = reg.box;
      if (imgX >= bx && imgX <= bx + bw && imgY >= by && imgY <= by + bh) {
        onRegionHover?.(reg);
        return;
      }
    }
    onRegionHover?.(null);
  };

  const handlePointerLeave = () => {
    if (task === "depth") {
      setProbeCoords(null);
    }
    onRegionHover?.(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (visibleRegions.length === 0) {
      onRegionSelect?.(null);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const scaleX = sourceWidth / containerSize.width;
    const scaleY = sourceHeight / containerSize.height;
    const imgX = clientX * scaleX;
    const imgY = clientY * scaleY;

    for (let i = visibleRegions.length - 1; i >= 0; i--) {
      const reg = visibleRegions[i]!;
      const [bx, by, bw, bh] = reg.box;
      if (imgX >= bx && imgX <= bx + bw && imgY >= by && imgY <= by + bh) {
        onRegionSelect?.(reg);
        const accIdx = accessibleRegions.findIndex((r) => r.id === reg.id);
        if (accIdx >= 0) setFocusedIndex(accIdx);
        return;
      }
    }
    onRegionSelect?.(null);
  };

  // Keyboard navigation for roving focus layer (R62)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (accessibleRegions.length === 0) return;

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev + 1 >= accessibleRegions.length ? 0 : prev + 1;
        const reg = accessibleRegions[next] || null;
        onRegionSelect?.(reg);
        return next;
      });
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev - 1 < 0 ? accessibleRegions.length - 1 : prev - 1;
        const reg = accessibleRegions[next] || null;
        onRegionSelect?.(reg);
        return next;
      });
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
      onRegionSelect?.(accessibleRegions[0] || null);
    } else if (e.key === "End") {
      e.preventDefault();
      const last = accessibleRegions.length - 1;
      setFocusedIndex(last);
      onRegionSelect?.(accessibleRegions[last] || null);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < accessibleRegions.length) {
        onRegionSelect?.(accessibleRegions[focusedIndex] || null);
      }
    }
  };

  const activeDescendantId =
    focusedIndex >= 0 && accessibleRegions[focusedIndex]
      ? `region-opt-${accessibleRegions[focusedIndex].id}`
      : undefined;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[360px] bg-[#0A0C10] select-none flex items-center justify-center overflow-hidden ${className}`}
    >
      {/* Background Media Layer */}
      {mediaUrl ? (
        mediaType === "video" ? (
          <video
            src={mediaUrl}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            playsInline
            muted
          />
        ) : (
          <img
            src={mediaUrl}
            alt="Source media under analysis"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-[#64748B]">
          [Synthetic Test Viewport: {sourceWidth}×{sourceHeight}]
        </div>
      )}

      {/* Artifact Error Banner Overlay (R58) */}
      {artifactError && (
        <div className="absolute inset-x-4 top-4 z-20 p-3 rounded-[6px] bg-[#2A1517] border border-[#F87171]/40 text-[#FCA5A5] text-xs font-mono flex items-center justify-between shadow-lg">
          <span>{artifactError}</span>
        </div>
      )}

      {/* 2D Canvas Layer */}
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        style={{ width: containerSize.width, height: containerSize.height }}
        className="absolute inset-0 cursor-crosshair z-10 touch-none"
      />

      {/* Screen Reader Long Description for Complex Dense Images (KTD4, W3C strategy) */}
      {accessibleDescription && (
        <div
          role="region"
          aria-label="Scene Analysis Summary"
          className="sr-only"
        >
          {accessibleDescription}
        </div>
      )}

      {/* Accessible Roving-Focus Region Layer (R62, KTD3) */}
      <div
        ref={listboxRef}
        role="listbox"
        tabIndex={0}
        aria-label={`Visual detections: ${accessibleRegions.length} objects in frame`}
        aria-activedescendant={activeDescendantId}
        onKeyDown={handleKeyDown}
        className="sr-only focus:not-sr-only focus:absolute focus:bottom-2 focus:left-2 focus:z-30 focus:p-2 focus:bg-[#12151C] focus:border focus:border-[#22D3EE] focus:rounded focus:text-xs focus:font-mono focus:text-[#E8EAED] focus:shadow-xl"
      >
        <div className="text-[10px] text-[#22D3EE] pb-1">
          Use Arrow keys to explore regions ({accessibleRegions.length} total):
        </div>
        {accessibleRegions.map((reg, idx) => {
          const isFocused = idx === focusedIndex;
          const labelText = `${sanitizeText(reg.className)}, confidence ${Math.round(
            reg.confidence * 100,
          )}% at position [${Math.round(reg.box[0])}, ${Math.round(reg.box[1])}]${
            reg.trackId !== undefined ? `, track ID ${reg.trackId}` : ""
          }`;

          return (
            <div
              key={reg.id}
              id={`region-opt-${reg.id}`}
              role="option"
              aria-selected={isFocused}
              className={`py-0.5 px-1 rounded ${
                isFocused ? "bg-[#22D3EE]/20 text-[#22D3EE]" : "text-[#9AA3B2]"
              }`}
            >
              {labelText}
            </div>
          );
        })}
      </div>
    </div>
  );
}
