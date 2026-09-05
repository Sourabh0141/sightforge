"use client";

import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { LoaderIcon } from "./icons";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "link";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      leftIcon,
      rightIcon,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0C10] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none rounded-[6px]";

    const sizeStyles = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-9 px-4 text-sm gap-2",
      lg: "h-11 px-6 text-base gap-2.5",
    };

    const variantStyles = {
      primary:
        "bg-[#22D3EE] text-[#0A0C10] font-semibold hover:bg-[#06B6D4] active:bg-[#0891B2] shadow-sm",
      secondary:
        "bg-[#1A1F29] text-[#E8EAED] border border-[#252B37] hover:bg-[#202633] hover:border-[#374151] active:bg-[#12151C]",
      danger:
        "bg-[#1A1F29] text-[#F87171] border border-[#F87171]/30 hover:bg-[#F87171]/10 hover:border-[#F87171] active:bg-[#F87171]/20",
      ghost:
        "bg-transparent text-[#9AA3B2] hover:text-[#E8EAED] hover:bg-[#1A1F29]/60 active:bg-[#1A1F29]",
      link: "bg-transparent text-[#22D3EE] hover:underline p-0 h-auto font-normal",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={twMerge(
          clsx(baseStyles, sizeStyles[size], variantStyles[variant], className),
        )}
        {...props}
      >
        {isLoading ? (
          <LoaderIcon className="h-4 w-4 animate-spin shrink-0" />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  },
);

Button.displayName = "Button";
