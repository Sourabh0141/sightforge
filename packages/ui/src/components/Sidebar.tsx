"use client";

import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  LayersIcon,
  PlusCircleIcon,
  LayoutGridIcon,
  SettingsIcon,
  LogOutIcon,
  UserIcon,
  SparklesIcon,
} from "./icons";
import { Button } from "./Button";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string | number;
}

export interface SidebarProps {
  currentPath?: string;
  userEmail?: string;
  dailyJobsUsed?: number;
  dailyJobsLimit?: number;
  onSignOut?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath = "/jobs",
  userEmail = "developer@sightforge.dev",
  dailyJobsUsed = 7,
  dailyJobsLimit = 50,
  onSignOut,
  className,
}) => {
  const navItems: NavItem[] = [
    {
      id: "jobs",
      label: "Jobs",
      href: "/jobs",
      icon: <LayersIcon className="h-4 w-4" />,
    },
    {
      id: "new",
      label: "New job",
      href: "/new",
      icon: <PlusCircleIcon className="h-4 w-4" />,
    },
    {
      id: "gallery",
      label: "Gallery",
      href: "/gallery",
      icon: <LayoutGridIcon className="h-4 w-4" />,
    },
    {
      id: "settings",
      label: "Settings",
      href: "/settings",
      icon: <SettingsIcon className="h-4 w-4" />,
    },
  ];

  const quotaPercent = Math.min(
    100,
    Math.round((dailyJobsUsed / dailyJobsLimit) * 100),
  );

  return (
    <aside
      className={twMerge(
        clsx(
          "w-60 h-screen bg-[#0A0C10] border-r border-[#252B37] flex flex-col justify-between p-4 shrink-0 select-none",
          className,
        ),
      )}
    >
      {/* Top section: Wordmark & New Job CTA */}
      <div className="space-y-6">
        {/* Wordmark */}
        <a href="/" className="flex items-center gap-2.5 px-2 py-1 group">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#22D3EE]/10 border border-[#22D3EE]/30 text-[#22D3EE] group-hover:bg-[#22D3EE]/20 transition-colors">
            <SparklesIcon className="h-4 w-4" />
          </div>
          <span className="font-semibold text-base tracking-tight text-[#E8EAED]">
            SightForge
          </span>
        </a>

        {/* Primary New Job CTA Button */}
        <a href="/new" className="block">
          <Button
            variant="primary"
            className="w-full justify-center shadow-sm"
            leftIcon={<PlusCircleIcon className="h-4 w-4" />}
          >
            New job
          </Button>
        </a>

        {/* Navigation list */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              currentPath === item.href ||
              currentPath.startsWith(`${item.href}/`);
            return (
              <a
                key={item.id}
                href={item.href}
                className={clsx(
                  "flex items-center justify-between px-3 py-2 rounded-[6px] text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[#1A1F29] text-[#E8EAED] border-l-2 border-[#22D3EE]"
                    : "text-[#9AA3B2] hover:text-[#E8EAED] hover:bg-[#12151C]",
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={clsx(
                      isActive ? "text-[#22D3EE]" : "text-[#9AA3B2]",
                    )}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#252B37] text-[#9AA3B2]">
                    {item.badge}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </div>

      {/* Bottom pinned section: Daily quota bar & User account */}
      <div className="space-y-4 pt-4 border-t border-[#252B37]">
        {/* Daily Quota Progress */}
        <div className="p-3 rounded-[6px] bg-[#12151C] border border-[#252B37]/60 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#9AA3B2]">Daily allowance</span>
            <span className="font-mono text-[#E8EAED]">
              {dailyJobsUsed} / {dailyJobsLimit}
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#1A1F29] rounded-full overflow-hidden">
            <div
              className={clsx(
                "h-full rounded-full transition-all duration-300",
                quotaPercent > 90
                  ? "bg-[#F87171]"
                  : quotaPercent > 75
                    ? "bg-[#FBBF24]"
                    : "bg-[#22D3EE]",
              )}
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
        </div>

        {/* User profile & sign out */}
        <div className="flex items-center justify-between px-2 text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A1F29] border border-[#252B37] text-[#9AA3B2]">
              <UserIcon className="h-3 w-3" />
            </div>
            <span
              className="truncate font-mono text-[#9AA3B2]"
              title={userEmail}
            >
              {userEmail}
            </span>
          </div>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="p-1 rounded text-[#9AA3B2] hover:text-[#F87171] transition-colors focus-visible:ring-2 focus-visible:ring-[#22D3EE]"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOutIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
