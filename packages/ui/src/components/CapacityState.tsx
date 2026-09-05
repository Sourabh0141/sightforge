"use client";

import React, { useState, useEffect } from "react";
import {
  GaugeIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  HistoryIcon,
} from "./icons";
import { Button } from "./Button";

export interface CapacityStateProps {
  initialCountdown?: string;
  resetsAt?: Date;
  sourceRepoUrl?: string;
}

export const CapacityState: React.FC<CapacityStateProps> = ({
  initialCountdown = "Resets in 6h 12m",
  resetsAt,
  sourceRepoUrl = "https://github.com/Sourabh0141/sightforge",
}) => {
  const [countdown, setCountdown] = useState(initialCountdown);

  useEffect(() => {
    if (!resetsAt) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diffMs = Math.max(0, resetsAt.getTime() - now.getTime());
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      setCountdown(`Resets in ${hours}h ${minutes}m`);
    }, 30000);

    return () => clearInterval(interval);
  }, [resetsAt]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-lg bg-[#12151C] border border-[#252B37] rounded-[8px] p-8 md:p-10 shadow-2xl">
        {/* Gauge icon container */}
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#1A1F29] border border-[#252B37] text-[#22D3EE] mb-6">
          <GaugeIcon className="h-8 w-8" />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-[#E8EAED] tracking-tight mb-4">
          At capacity for today
        </h1>

        {/* Engineering rationale paragraphs */}
        <div className="space-y-3 text-sm text-[#9AA3B2] leading-relaxed text-left mb-6">
          <p>
            SightForge has reached its daily infrastructure processing
            allowance. New computer vision analysis jobs cannot be accepted at
            this time.
          </p>
          <p>
            The platform operates on a free serverless GPU tier with a strict
            daily compute ceiling. This ceiling prevents unbounded cloud spend
            and keeps the service completely free to use.
          </p>
        </div>

        {/* Monospace countdown indicator */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1A1F29] border border-[#252B37] text-xs font-mono text-[#22D3EE] mb-8">
          <span className="h-2 w-2 rounded-full bg-[#22D3EE] animate-pulse" />
          <span>{countdown} (00:00 UTC)</span>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a href="/gallery" className="w-full sm:w-auto">
            <Button
              variant="primary"
              className="w-full sm:w-auto"
              rightIcon={<ArrowRightIcon className="h-4 w-4" />}
            >
              View Demo Gallery
            </Button>
          </a>
          <a
            href={sourceRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto"
          >
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              rightIcon={<ExternalLinkIcon className="h-4 w-4" />}
            >
              Read Source
            </Button>
          </a>
        </div>

        {/* Past results link */}
        <div className="mt-6 pt-6 border-t border-[#252B37]">
          <a
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-xs text-[#9AA3B2] hover:text-[#22D3EE] transition-colors"
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            <span>Your past results remain available</span>
          </a>
        </div>
      </div>
    </div>
  );
};
