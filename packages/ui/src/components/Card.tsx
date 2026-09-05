"use client";

import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "raised" | "subtle" | "danger";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", children, ...props }, ref) => {
    const variantStyles = {
      default: "bg-[#1A1F29] border border-[#252B37]",
      raised: "bg-[#12151C] border border-[#252B37]",
      subtle: "bg-[#111318] border border-[#252B37]/60",
      danger: "bg-[#1A1F29] border border-[#F87171]/40",
    };

    return (
      <div
        ref={ref}
        className={twMerge(
          clsx(
            "rounded-[8px] p-6 text-[#E8EAED] transition-colors",
            variantStyles[variant],
            className,
          ),
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";
