"use client";

import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  CheckIcon,
  XIcon,
  LoaderIcon,
  MinusIcon,
  CircleIcon,
  ClockIcon,
  ArrowUpCircleIcon,
} from "./icons";

export type JobStatusType =
  | "created"
  | "uploading"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: JobStatusType;
  framesProcessed?: number;
  framesTotal?: number;
  failureReason?: string;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  framesProcessed,
  framesTotal,
  failureReason,
  className,
  ...props
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case "created":
        return {
          icon: <CircleIcon className="h-3 w-3 text-[#9AA3B2]" />,
          label: "Created",
          styles: "bg-[#1A1F29] text-[#9AA3B2] border-[#252B37]",
        };
      case "uploading":
        return {
          icon: (
            <ArrowUpCircleIcon className="h-3 w-3 text-[#9AA3B2] animate-pulse" />
          ),
          label: "Uploading",
          styles: "bg-[#1A1F29] text-[#9AA3B2] border-[#252B37]",
        };
      case "queued":
        return {
          icon: <ClockIcon className="h-3 w-3 text-[#60A5FA]" />,
          label: "Queued",
          styles: "bg-[#60A5FA]/10 text-[#60A5FA] border-[#60A5FA]/20",
        };
      case "processing":
        return {
          icon: <LoaderIcon className="h-3 w-3 text-[#22D3EE] animate-spin" />,
          label:
            framesProcessed !== undefined && framesTotal !== undefined
              ? `${framesProcessed} / ${framesTotal} frames`
              : "Processing",
          styles: "bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/30",
        };
      case "completed":
        return {
          icon: <CheckIcon className="h-3 w-3 text-[#34D399]" />,
          label: "Completed",
          styles: "bg-[#34D399]/10 text-[#34D399] border-[#34D399]/30",
        };
      case "failed":
        return {
          icon: <XIcon className="h-3 w-3 text-[#F87171]" />,
          label: failureReason ? `Failed: ${failureReason}` : "Failed",
          styles: "bg-[#F87171]/10 text-[#F87171] border-[#F87171]/30",
        };
      case "cancelled":
        return {
          icon: <MinusIcon className="h-3 w-3 text-[#6B7280]" />,
          label: "Cancelled",
          styles: "bg-[#1A1F29] text-[#6B7280] border-[#252B37]",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border transition-colors",
          config.styles,
          className,
        ),
      )}
      {...props}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
};
