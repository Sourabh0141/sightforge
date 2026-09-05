"use client";

import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  InboxIcon,
  FilterXIcon,
  ClockAlertIcon,
  SearchIcon,
  ArrowRightIcon,
} from "./icons";
import { Button } from "./Button";

export type EmptyStateType =
  "no-jobs" | "no-filter-match" | "expired" | "no-detections" | "custom";

export interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  primaryActionLabel?: string;
  primaryActionHref?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  secondaryActionHref?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = "no-jobs",
  title,
  description,
  primaryActionLabel,
  primaryActionHref,
  onPrimaryAction,
  secondaryActionLabel,
  secondaryActionHref,
  onSecondaryAction,
  className,
}) => {
  const getDefaults = () => {
    switch (type) {
      case "no-jobs":
        return {
          icon: <InboxIcon className="h-10 w-10 text-[#6B7280]" />,
          title: title || "No jobs yet",
          description:
            description ||
            "Upload an image or a short video clip to run object detection, pose estimation, depth maps, and more.",
          primaryLabel: primaryActionLabel || "Run your first job",
          primaryHref: primaryActionHref || "/new",
          secondaryLabel: secondaryActionLabel || "Or view demo gallery",
          secondaryHref: secondaryActionHref || "/gallery",
        };
      case "no-filter-match":
        return {
          icon: <FilterXIcon className="h-10 w-10 text-[#6B7280]" />,
          title: title || "No matching jobs",
          description:
            description || "No jobs match your current filter selections.",
          primaryLabel: primaryActionLabel || "Clear filters",
          primaryHref: primaryActionHref,
          secondaryLabel: secondaryActionLabel,
          secondaryHref: secondaryActionHref,
        };
      case "expired":
        return {
          icon: <ClockAlertIcon className="h-10 w-10 text-[#FBBF24]" />,
          title: title || "Results expired",
          description:
            description ||
            "Analysis results are retained for 30 days. This job's result artifacts have passed their retention window and were permanently removed.",
          primaryLabel: primaryActionLabel || "Run new job on this file",
          primaryHref: primaryActionHref || "/new",
          secondaryLabel: secondaryActionLabel,
          secondaryHref: secondaryActionHref,
        };
      case "no-detections":
        return {
          icon: <SearchIcon className="h-10 w-10 text-[#6B7280]" />,
          title: title || "No detections found",
          description:
            description ||
            "The model did not find any targets matching the selected confidence threshold in this frame.",
          primaryLabel: primaryActionLabel,
          primaryHref: primaryActionHref,
          secondaryLabel: secondaryActionLabel,
          secondaryHref: secondaryActionHref,
        };
      default:
        return {
          icon: <InboxIcon className="h-10 w-10 text-[#6B7280]" />,
          title: title || "No data available",
          description: description || "",
          primaryLabel: primaryActionLabel,
          primaryHref: primaryActionHref,
          secondaryLabel: secondaryActionLabel,
          secondaryHref: secondaryActionHref,
        };
    }
  };

  const defaults = getDefaults();

  return (
    <div
      className={twMerge(
        clsx(
          "flex flex-col items-center justify-center p-12 text-center rounded-[8px] bg-[#12151C] border border-[#252B37]",
          className,
        ),
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1A1F29] border border-[#252B37] mb-4">
        {defaults.icon}
      </div>
      <h3 className="text-lg font-semibold text-[#E8EAED] mb-2">
        {defaults.title}
      </h3>
      {defaults.description && (
        <p className="max-w-md text-sm text-[#9AA3B2] mb-6 leading-relaxed">
          {defaults.description}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {defaults.primaryLabel &&
          (defaults.primaryHref ? (
            <Button href={defaults.primaryHref} variant="primary">
              {defaults.primaryLabel}
            </Button>
          ) : (
            <Button variant="primary" onClick={onPrimaryAction}>
              {defaults.primaryLabel}
            </Button>
          ))}
        {defaults.secondaryLabel &&
          (defaults.secondaryHref ? (
            <a
              href={defaults.secondaryHref}
              className="text-xs text-[#9AA3B2] hover:text-[#22D3EE] inline-flex items-center gap-1 transition-colors ml-2"
            >
              <span>{defaults.secondaryLabel}</span>
              <ArrowRightIcon className="h-3 w-3" />
            </a>
          ) : (
            <Button variant="ghost" size="sm" onClick={onSecondaryAction}>
              {defaults.secondaryLabel}
            </Button>
          ))}
      </div>
    </div>
  );
};
