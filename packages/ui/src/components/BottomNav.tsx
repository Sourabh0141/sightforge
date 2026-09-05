"use client";

import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { LayersIcon, PlusIcon, LayoutGridIcon, SettingsIcon } from "./icons";

export interface BottomNavProps {
  currentPath?: string;
  className?: string;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentPath = "/jobs",
  className,
}) => {
  const tabs = [
    {
      id: "jobs",
      label: "Jobs",
      href: "/jobs",
      icon: <LayersIcon className="h-5 w-5" />,
    },
    {
      id: "new",
      label: "New",
      href: "/new",
      icon: <PlusIcon className="h-6 w-6" />,
      isPrimary: true,
    },
    {
      id: "gallery",
      label: "Gallery",
      href: "/gallery",
      icon: <LayoutGridIcon className="h-5 w-5" />,
    },
    {
      id: "settings",
      label: "Settings",
      href: "/settings",
      icon: <SettingsIcon className="h-5 w-5" />,
    },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className={twMerge(
        clsx(
          "md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0A0C10] border-t border-[#252B37] px-4 py-2 flex items-center justify-around",
          className,
        ),
      )}
    >
      {tabs.map((tab) => {
        const isActive =
          currentPath === tab.href || currentPath.startsWith(`${tab.href}/`);
        if (tab.isPrimary) {
          return (
            <a
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-col items-center -mt-5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] rounded-full"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#22D3EE] text-[#0A0C10] shadow-lg shadow-[#22D3EE]/20 group-active:scale-95 transition-transform">
                {tab.icon}
              </div>
              <span className="text-[10px] font-medium text-[#22D3EE] mt-1">
                {tab.label}
              </span>
            </a>
          );
        }

        return (
          <a
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={clsx(
              "flex flex-col items-center gap-1 py-1 px-3 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE]",
              isActive
                ? "text-[#22D3EE]"
                : "text-[#9AA3B2] hover:text-[#E8EAED]",
            )}
          >
            {tab.icon}
            <span className="text-[10px] font-medium">{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
};
