"use client";

import React, { useCallback, useMemo } from "react";
import {
  ViewerShell,
  InfoIcon,
  SlidersIcon,
  SparklesIcon,
  Card,
} from "@sightforge/ui";
import type { GalleryTaskMetadata } from "@/lib/gallery-fixtures";

export interface GalleryTaskClientProps {
  taskMeta: GalleryTaskMetadata;
}

export function GalleryTaskClient({ taskMeta }: GalleryTaskClientProps) {
  const resolveArtifact = useCallback(
    () => taskMeta.artifactDataUrl || "",
    [taskMeta.artifactDataUrl],
  );

  const summary = taskMeta.document.summary;
  const isVideo = taskMeta.mediaType === "video" || taskMeta.isVideo;

  const runDetails = useMemo(() => {
    const details = [
      { label: "Task Identifier", value: taskMeta.task },
      {
        label: "Model Variant",
        value: taskMeta.document.model_variant || "yolo26n",
      },
      { label: "Execution Mode", value: taskMeta.document.mode || "per-frame" },
      { label: "Media Format", value: taskMeta.mediaType.toUpperCase() },
      {
        label: "Inference Latency",
        value: `${summary?.inference_duration_ms?.toFixed(1) || "40.0"}ms`,
      },
    ];

    if (isVideo && summary) {
      if (summary.sampled_fps) {
        details.push({
          label: "Sampled Rate",
          value: `${summary.sampled_fps} FPS`,
        });
      }
      if (summary.frames_processed) {
        details.push({
          label: "Processed Frames",
          value: `${summary.frames_processed} frames`,
        });
      }
      if (summary.duration_ms) {
        details.push({
          label: "Clip Duration",
          value: `${(summary.duration_ms / 1000).toFixed(1)}s`,
        });
      }
    }

    details.push({
      label: "Schema Version",
      value: `v${taskMeta.document.schema_version || "1.0.0"}`,
    });

    return details;
  }, [taskMeta, summary, isVideo]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Primary Visualizer & Raw Inspector Column */}
      <div className="lg:col-span-8 space-y-6">
        <div className="rounded-[8px] bg-[#12151C] border border-[#252B37] p-4 sm:p-6 shadow-xl">
          <ViewerShell
            document={taskMeta.document}
            mediaUrl={taskMeta.mediaUrl}
            resolveArtifact={resolveArtifact}
            readOnly
          />
        </div>
      </div>

      {/* Right Column: Task Details, Telemetry & Insights */}
      <div className="lg:col-span-4 space-y-6">
        {/* "What this is" Card */}
        <Card className="p-6 bg-[#12151C] border-[#252B37] space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#E8EAED]">
            <InfoIcon size={16} className="text-[#22D3EE]" />
            <span>About {taskMeta.title}</span>
          </div>
          <p className="text-xs text-[#9AA3B2] leading-relaxed">
            {taskMeta.explainer}
          </p>
        </Card>

        {/* Key Highlights Card */}
        {taskMeta.highlights && taskMeta.highlights.length > 0 && (
          <Card className="p-6 bg-[#12151C] border-[#252B37] space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#E8EAED]">
              <SparklesIcon size={16} className="text-[#22D3EE]" />
              <span>Result Highlights</span>
            </div>
            <div className="space-y-2 pt-1">
              {taskMeta.highlights.map((h, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs py-1 border-b border-[#252B37]/40 last:border-none"
                >
                  <span className="text-[#9AA3B2]">{h.label}</span>
                  <span className="font-mono text-[#E8EAED] font-medium text-right">
                    {h.value}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Run Details Definition List */}
        <Card className="p-6 bg-[#12151C] border-[#252B37] space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#E8EAED]">
            <SlidersIcon size={16} className="text-[#22D3EE]" />
            <span>Run Details</span>
          </div>
          <dl className="space-y-2 pt-1">
            {runDetails.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs py-1 border-b border-[#252B37]/40 last:border-none"
              >
                <dt className="text-[#9AA3B2]">{item.label}</dt>
                <dd className="font-mono text-[#22D3EE]">{item.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Stored Fixture Notice */}
        <div className="rounded-[8px] bg-[#1A1F29]/60 border border-[#252B37] p-4 text-center space-y-2">
          <p className="text-xs text-[#9AA3B2]">
            This is a pre-computed demo fixture running locally in your browser.
          </p>
          <a
            href="/signup"
            className="inline-block text-xs font-semibold text-[#22D3EE] hover:underline"
          >
            Create an account to run your own media &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
