"use client";

import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ArrowLeftIcon } from "./icons";

export interface TopBarProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  actions?: React.ReactNode;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  backHref,
  actions,
  className,
}) => {
  return (
    <header
      className={twMerge(
        clsx(
          "h-14 border-b border-[#252B37] bg-[#0A0C10]/80 backdrop-blur-sm px-6 flex items-center justify-between sticky top-0 z-30",
          className,
        ),
      )}
    >
      <div className="flex items-center gap-3">
        {backHref && (
          <a
            href={backHref}
            className="p-1 rounded text-[#9AA3B2] hover:text-[#E8EAED] hover:bg-[#1A1F29] transition-colors focus-visible:ring-2 focus-visible:ring-[#22D3EE]"
            aria-label="Back"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </a>
        )}
        <div>
          <h1 className="text-sm font-semibold text-[#E8EAED] tracking-tight">
            {title}
          </h1>
          {subtitle && <p className="text-xs text-[#9AA3B2]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
};
