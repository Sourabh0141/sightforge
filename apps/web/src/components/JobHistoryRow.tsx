/**
 * SightForge Job History Row & Mobile Card (P4 U5, R54, R56)
 *
 * Renders an individual job record in the dashboard with thumbnail, task metadata,
 * status pill, relative timestamp, and hover/inline action controls.
 */

"use client";

import React, { useState } from "react";
import {
  StatusPill,
  Button,
  TrashIcon,
  EyeIcon,
  MinusIcon,
  FileVideoIcon,
  FileImageIcon,
  ChevronRightIcon,
  type JobStatusType,
} from "@sightforge/ui";

export interface JobRecord {
  id: string;
  userId: string;
  task: string;
  modelVariant: string;
  mode: string;
  mediaType: "image" | "video";
  status: JobStatusType;
  originalFilename?: string | null;
  mediaKey?: string | null;
  resultKey?: string | null;
  denseArtifactKey?: string | null;
  confidenceThreshold?: number | null;
  framesCompleted?: number | null;
  framesTotal?: number | null;
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
}

export interface JobHistoryRowProps {
  job: JobRecord;
  onDelete: (jobId: string) => Promise<void>;
  onCancel: (jobId: string) => Promise<void>;
}

export const JobHistoryRow: React.FC<JobHistoryRowProps> = ({
  job,
  onDelete,
  onCancel,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const isRunning =
    job.status === "created" ||
    job.status === "uploading" ||
    job.status === "queued" ||
    job.status === "processing";

  const isCompleted = job.status === "completed";

  // Format relative timestamp
  const formatRelativeTime = (dateInput: string | number | Date): string => {
    const timestamp = new Date(dateInput).getTime();
    if (isNaN(timestamp)) return "recently";
    const diffSeconds = Math.max(
      0,
      Math.floor((Date.now() - timestamp) / 1000),
    );

    if (diffSeconds < 60) return "just now";
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  const formatTaskName = (task: string): string => {
    switch (task) {
      case "detection":
        return "Object Detection";
      case "instance_segmentation":
        return "Instance Segmentation";
      case "semantic_segmentation":
        return "Semantic Segmentation";
      case "classification":
        return "Classification";
      case "pose":
        return "Pose Estimation";
      case "obb":
        return "Oriented Bounding Box";
      case "depth":
        return "Depth Estimation";
      default:
        return task;
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Permanently delete this job and its stored results?")) {
      setIsDeleting(true);
      try {
        await onDelete(job.id);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleCancelClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCancelling(true);
    try {
      await onCancel(job.id);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <a
      href={`/jobs?id=${job.id}`}
      className={`group block bg-[#12151C] hover:bg-[#1A1F29]/80 border transition-all rounded-[8px] p-4 focus:outline-none focus:ring-2 focus:ring-[#22D3EE] ${
        isRunning
          ? "border-l-4 border-l-[#22D3EE] border-t-[#252B37] border-r-[#252B37] border-b-[#252B37]"
          : "border-[#252B37] hover:border-[#252B37]/90"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: Thumbnail & Task Info */}
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Media Thumbnail Placeholder */}
          <div className="w-12 h-12 rounded-[6px] bg-[#0A0C10] border border-[#252B37] flex items-center justify-center shrink-0 text-[#9AA3B2] relative">
            {job.mediaType === "video" ? (
              <>
                <FileVideoIcon size={20} className="text-[#A78BFA]" />
                <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-[#0A0C10]/90 text-[8px] font-mono text-[#A78BFA]">
                  MP4
                </span>
              </>
            ) : (
              <FileImageIcon size={20} className="text-[#22D3EE]" />
            )}
          </div>

          {/* Task & Filename Details */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#E8EAED] truncate group-hover:text-[#22D3EE] transition-colors">
                {formatTaskName(job.task)}
              </span>
              {job.originalFilename && (
                <span
                  className="text-xs text-[#6B7280] truncate hidden md:inline font-mono"
                  title={job.originalFilename}
                >
                  · {job.originalFilename}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#9AA3B2]">
              <span className="capitalize">{job.modelVariant}</span>
              <span>·</span>
              <span className="capitalize">
                {job.mode === "per_frame" ? "Per-frame" : job.mode}
              </span>
              <span className="text-[#6B7280] hidden sm:inline">
                ({job.id.slice(0, 8)})
              </span>
            </div>
          </div>
        </div>

        {/* Right: Status, Timestamp & Action Buttons */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Status Pill */}
          <StatusPill
            status={job.status}
            framesProcessed={job.framesCompleted ?? undefined}
            framesTotal={job.framesTotal ?? undefined}
            failureReason={job.errorCode ?? undefined}
          />

          {/* Relative Timestamp */}
          <span className="text-xs font-mono text-[#6B7280] hidden sm:inline min-w-[70px] text-right">
            {formatRelativeTime(job.createdAt)}
          </span>

          {/* Action Button Group */}
          <div className="flex items-center gap-1.5 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            {isCompleted && (
              <Button
                size="sm"
                variant="secondary"
                className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs"
              >
                <EyeIcon size={12} />
                <span>View</span>
              </Button>
            )}

            {isRunning && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCancelClick}
                disabled={isCancelling}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-xs text-[#F87171] hover:bg-[#F87171]/10"
              >
                <MinusIcon size={12} />
                <span>{isCancelling ? "Cancelling…" : "Cancel"}</span>
              </Button>
            )}

            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={isDeleting}
              title="Delete job"
              className="p-1.5 text-[#6B7280] hover:text-[#F87171] hover:bg-[#1A1F29] rounded-[4px] transition-colors"
            >
              <TrashIcon size={14} />
            </button>
          </div>

          <ChevronRightIcon size={16} className="text-[#6B7280] sm:hidden" />
        </div>
      </div>
    </a>
  );
};
