"use client";

import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  AlertCircleIcon,
  WifiOffIcon,
  XIcon,
  RefreshCwIcon,
  ArrowRightIcon,
} from "./icons";
import { Button } from "./Button";

export interface ErrorBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  variant?: "error" | "warning" | "offline";
  className?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  title,
  message,
  actionLabel,
  actionHref,
  onAction,
  onDismiss,
  variant = "error",
  className,
  ...props
}) => {
  const getStyles = () => {
    switch (variant) {
      case "offline":
        return {
          container: "bg-[#FBBF24]/10 border-[#FBBF24]/30 text-[#FBBF24]",
          icon: <WifiOffIcon className="h-5 w-5 text-[#FBBF24] shrink-0" />,
        };
      case "warning":
        return {
          container: "bg-[#FBBF24]/10 border-[#FBBF24]/30 text-[#FBBF24]",
          icon: <AlertCircleIcon className="h-5 w-5 text-[#FBBF24] shrink-0" />,
        };
      case "error":
      default:
        return {
          container: "bg-[#F87171]/10 border-[#F87171]/30 text-[#F87171]",
          icon: <AlertCircleIcon className="h-5 w-5 text-[#F87171] shrink-0" />,
        };
    }
  };

  const { container, icon } = getStyles();

  return (
    <div
      role="alert"
      className={twMerge(
        clsx(
          "flex items-start justify-between gap-4 p-4 rounded-[8px] border",
          container,
          className,
        ),
      )}
      {...props}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          {title && (
            <h4 className="text-sm font-semibold text-[#E8EAED] mb-0.5">
              {title}
            </h4>
          )}
          <p className="text-xs text-[#9AA3B2] leading-relaxed">{message}</p>
          {actionLabel && (
            <div className="mt-2.5">
              {actionHref ? (
                <a
                  href={actionHref}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#22D3EE] hover:underline"
                >
                  <span>{actionLabel}</span>
                  <ArrowRightIcon className="h-3 w-3" />
                </a>
              ) : (
                <Button size="sm" variant="secondary" onClick={onAction}>
                  {actionLabel}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-[#9AA3B2] hover:text-[#E8EAED] p-1 rounded focus-visible:ring-2 focus-visible:ring-[#22D3EE]"
          aria-label="Dismiss error"
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

export const ReconnectingBanner: React.FC<{ isReconnecting?: boolean }> = ({
  isReconnecting = true,
}) => {
  if (!isReconnecting) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-[#FBBF24]/15 border-b border-[#FBBF24]/30 px-4 py-1.5 text-xs text-[#FBBF24]">
      <RefreshCwIcon className="h-3.5 w-3.5 animate-spin shrink-0" />
      <span>Connection lost. Reconnecting to live job updates…</span>
    </div>
  );
};
