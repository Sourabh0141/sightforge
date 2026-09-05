/**
 * SightForge Job Stage Tracker (P4 U5, R31, R32, R33, R58)
 *
 * Renders the 4-step stage progress tracker, honest serverless cold-start explanation,
 * fine-grained video frame counter, details definition list, and inline cancellation.
 */

"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  Button,
  StatusPill,
  CheckIcon,
  XIcon,
  MinusIcon,
  LoaderIcon,
  InfoIcon,
  AlertCircleIcon,
} from "@sightforge/ui";
import type { LiveJobStatusData } from "../lib/use-job-status";
import { getErrorDescriptor } from "../lib/errors";

export interface JobStageTrackerProps {
  data: LiveJobStatusData;
  onCancel: () => Promise<void>;
  onRetry?: () => void;
}

type StageName = "uploading" | "queued" | "processing" | "completed";

export const JobStageTracker: React.FC<JobStageTrackerProps> = ({
  data,
  onCancel,
  onRetry,
}) => {
  const [queuedSeconds, setQueuedSeconds] = useState<number>(0);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isFailed = data.status === "failed";
  const isCancelled = data.status === "cancelled";
  const isComplete = data.status === "completed";
  const isTerminal = isFailed || isCancelled || isComplete;

  // Track elapsed queued time to show honest cold-start note (R32)
  useEffect(() => {
    if (data.status !== "queued") {
      setQueuedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setQueuedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [data.status]);

  const handleCancelClick = async () => {
    setIsCancelling(true);
    setCancelError(null);
    try {
      await onCancel();
      setIsConfirmingCancel(false);
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : "Failed to cancel job",
      );
    } finally {
      setIsCancelling(false);
    }
  };

  // Determine stage status
  const getStageState = (
    stage: StageName,
  ): "completed" | "active" | "failed" | "cancelled" | "upcoming" => {
    if (isCancelled) {
      if (stage === "uploading" && data.status !== "uploading")
        return "completed";
      if (stage === "queued" && data.status === "processing")
        return "completed";
      return "cancelled";
    }

    if (isFailed) {
      if (stage === "uploading" && data.status !== "uploading")
        return "completed";
      if (stage === "queued" && data.status === "processing")
        return "completed";
      return "failed";
    }

    switch (stage) {
      case "uploading":
        if (data.status === "uploading" || data.status === "created")
          return "active";
        return "completed";
      case "queued":
        if (data.status === "uploading" || data.status === "created")
          return "upcoming";
        if (data.status === "queued") return "active";
        return "completed";
      case "processing":
        if (
          data.status === "uploading" ||
          data.status === "created" ||
          data.status === "queued"
        )
          return "upcoming";
        if (data.status === "processing") return "active";
        return "completed";
      case "completed":
        if (data.status === "completed") return "completed";
        return "upcoming";
    }
  };

  const stages: { id: StageName; label: string }[] = [
    { id: "uploading", label: "Uploading" },
    { id: "queued", label: "Queued" },
    { id: "processing", label: "Processing" },
    { id: "completed", label: "Complete" },
  ];

  // Failure message resolution (R58)
  const failureDescriptor = data.errorCode
    ? getErrorDescriptor(data.errorCode)
    : {
        title: "Analysis Failed",
        message:
          data.errorMessage || "An unexpected error occurred during inference.",
        actionLabel: "Configure new job",
        actionHref: "/new",
      };

  return (
    <Card className="max-w-2xl mx-auto space-y-6 bg-[#12151C] border-[#252B37] p-6 sm:p-8">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#252B37] pb-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-[#E8EAED]">
            {isComplete
              ? "Analysis Complete"
              : isFailed
                ? "Analysis Failed"
                : isCancelled
                  ? "Analysis Cancelled"
                  : "Analysis in Progress"}
          </h2>
          <div className="text-xs font-mono text-[#9AA3B2] flex items-center gap-2">
            <span>Job ID:</span>
            <span className="text-[#22D3EE]">{data.jobId}</span>
          </div>
        </div>
        <StatusPill
          status={data.status}
          framesProcessed={data.framesCompleted}
          framesTotal={data.framesTotal ?? undefined}
          failureReason={data.errorCode ?? undefined}
        />
      </div>

      {/* 4-Stage Progress Tracker */}
      <div className="py-2">
        {/* Desktop / Tablet Horizontal Tracker */}
        <div className="hidden sm:flex items-center justify-between relative">
          {stages.map((stage, idx) => {
            const state = getStageState(stage.id);
            const isLast = idx === stages.length - 1;

            return (
              <React.Fragment key={stage.id}>
                <div className="flex flex-col items-center relative z-10 space-y-2">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                      state === "completed"
                        ? "bg-[#34D399]/15 border-[#34D399] text-[#34D399]"
                        : state === "active"
                          ? "bg-[#22D3EE]/15 border-[#22D3EE] text-[#22D3EE] ring-4 ring-[#22D3EE]/10"
                          : state === "failed"
                            ? "bg-[#F87171]/15 border-[#F87171] text-[#F87171]"
                            : state === "cancelled"
                              ? "bg-[#1A1F29] border-[#6B7280] text-[#6B7280]"
                              : "bg-[#1A1F29] border-[#252B37] text-[#6B7280]"
                    }`}
                  >
                    {state === "completed" && <CheckIcon size={16} />}
                    {state === "active" && (
                      <LoaderIcon size={16} className="animate-spin" />
                    )}
                    {state === "failed" && <XIcon size={16} />}
                    {state === "cancelled" && <MinusIcon size={16} />}
                    {state === "upcoming" && (
                      <span className="text-xs font-mono">{idx + 1}</span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      state === "active"
                        ? "text-[#22D3EE] font-semibold"
                        : state === "completed"
                          ? "text-[#E8EAED]"
                          : "text-[#6B7280]"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>

                {!isLast && (
                  <div className="flex-1 h-0.5 bg-[#252B37] mx-2 -mt-6">
                    <div
                      className={`h-full transition-all duration-300 ${
                        state === "completed"
                          ? "bg-[#22D3EE]"
                          : "bg-transparent"
                      }`}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Mobile Vertical Tracker */}
        <div className="sm:hidden space-y-4">
          {stages.map((stage, idx) => {
            const state = getStageState(stage.id);
            return (
              <div key={stage.id} className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs shrink-0 ${
                    state === "completed"
                      ? "bg-[#34D399]/15 border-[#34D399] text-[#34D399]"
                      : state === "active"
                        ? "bg-[#22D3EE]/15 border-[#22D3EE] text-[#22D3EE]"
                        : state === "failed"
                          ? "bg-[#F87171]/15 border-[#F87171] text-[#F87171]"
                          : "bg-[#1A1F29] border-[#252B37] text-[#6B7280]"
                  }`}
                >
                  {state === "completed" ? (
                    <CheckIcon size={14} />
                  ) : state === "active" ? (
                    <LoaderIcon size={14} className="animate-spin" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`text-xs ${
                    state === "active"
                      ? "text-[#22D3EE] font-semibold"
                      : "text-[#9AA3B2]"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic Status / Cold Start / Frame Progress Callout */}
      <div className="p-4 bg-[#1A1F29]/60 rounded-[8px] border border-[#252B37] space-y-3">
        {data.status === "queued" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[#60A5FA]">
              <span className="w-2 h-2 rounded-full bg-[#60A5FA] animate-pulse" />
              <span>Job queued in edge queue</span>
            </div>
            {queuedSeconds >= 3 ? (
              <div className="text-xs text-[#9AA3B2] flex items-start gap-2 pt-1 border-t border-[#252B37]/60 animate-in fade-in">
                <InfoIcon
                  size={15}
                  className="text-[#22D3EE] shrink-0 mt-0.5"
                />
                <span>
                  Starting up the analysis container. This usually takes 8 to 15
                  seconds on a cold start because compute scales to zero when
                  idle.
                </span>
              </div>
            ) : (
              <p className="text-xs text-[#9AA3B2]">
                Preparing compute allocation…
              </p>
            )}
          </div>
        )}

        {data.status === "processing" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#22D3EE] flex items-center gap-2 font-medium">
                <LoaderIcon size={14} className="animate-spin" />
                <span>
                  {data.mediaType === "video"
                    ? "Running video inference pipeline…"
                    : "Analysing image…"}
                </span>
              </span>
              {data.mediaType === "video" &&
                data.framesTotal &&
                data.framesTotal > 0 && (
                  <span className="text-[#E8EAED]">
                    {data.framesCompleted ?? 0} / {data.framesTotal} frames (
                    {Math.round(
                      ((data.framesCompleted ?? 0) / data.framesTotal) * 100,
                    )}
                    %)
                  </span>
                )}
            </div>

            {/* Frame Progress Bar for Video (R31) */}
            {data.mediaType === "video" &&
              data.framesTotal &&
              data.framesTotal > 0 && (
                <div className="w-full h-2 bg-[#12151C] rounded-full overflow-hidden border border-[#252B37]">
                  <div
                    className="h-full bg-[#22D3EE] transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          2,
                          Math.round(
                            ((data.framesCompleted ?? 0) / data.framesTotal) *
                              100,
                          ),
                        ),
                      )}%`,
                    }}
                  />
                </div>
              )}
          </div>
        )}

        {isFailed && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F87171]">
              <AlertCircleIcon size={16} />
              <span>{failureDescriptor.title}</span>
            </div>
            <p className="text-xs text-[#E8EAED]">
              {failureDescriptor.message}
            </p>
            {failureDescriptor.actionLabel && (
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={
                    onRetry ||
                    (() => {
                      window.location.href =
                        failureDescriptor.actionHref || "/new";
                    })
                  }
                >
                  {failureDescriptor.actionLabel}
                </Button>
              </div>
            )}
          </div>
        )}

        {isCancelled && (
          <div className="space-y-1 text-xs text-[#9AA3B2]">
            <span className="font-medium text-[#E8EAED]">
              Analysis cancelled by user.
            </span>
            <p>
              Compute has halted and temporary resources have been released.
            </p>
          </div>
        )}

        {isComplete && (
          <div className="text-xs text-[#34D399] flex items-center gap-2 font-medium">
            <CheckIcon size={16} />
            <span>Structured inference results are ready for inspection.</span>
          </div>
        )}
      </div>

      {/* Monospace Run Details List */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono p-4 bg-[#0A0C10] rounded-[8px] border border-[#252B37]">
        <div>
          <span className="text-[#6B7280] block text-[10px] uppercase">
            Task
          </span>
          <span className="text-[#E8EAED]">{data.task || "detection"}</span>
        </div>
        <div>
          <span className="text-[#6B7280] block text-[10px] uppercase">
            Model
          </span>
          <span className="text-[#E8EAED]">{data.modelVariant || "nano"}</span>
        </div>
        <div>
          <span className="text-[#6B7280] block text-[10px] uppercase">
            Mode
          </span>
          <span className="text-[#E8EAED]">{data.mode || "per_frame"}</span>
        </div>
        <div>
          <span className="text-[#6B7280] block text-[10px] uppercase">
            Type
          </span>
          <span className="text-[#22D3EE] uppercase">
            {data.mediaType || "image"}
          </span>
        </div>
      </div>

      {/* Non-terminal Inline Cancellation (R33) */}
      {!isTerminal && (
        <div className="pt-2 border-t border-[#252B37]">
          {isConfirmingCancel ? (
            <div className="p-3 bg-[#F87171]/10 border border-[#F87171]/30 rounded-[8px] space-y-2 animate-in fade-in">
              <span className="text-xs text-[#F87171] block font-medium">
                Are you sure you want to cancel this analysis?
              </span>
              {cancelError && (
                <span className="text-[11px] text-[#F87171] block">
                  {cancelError}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleCancelClick}
                  disabled={isCancelling}
                >
                  {isCancelling ? "Cancelling…" : "Yes, cancel job"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsConfirmingCancel(false)}
                  disabled={isCancelling}
                >
                  Keep running
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsConfirmingCancel(true)}
              className="text-[#9AA3B2] hover:text-[#F87171] hover:border-[#F87171]/40"
            >
              Cancel job
            </Button>
          )}
        </div>
      )}
    </Card>
  );
};
