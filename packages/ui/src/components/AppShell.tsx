"use client";

import React from "react";
import { Sidebar, type SidebarProps } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { TopBar, type TopBarProps } from "./TopBar";

export interface AppShellProps extends SidebarProps {
  topBarProps?: TopBarProps;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentPath = "/jobs",
  userEmail,
  dailyJobsUsed,
  dailyJobsLimit,
  onSignOut,
  topBarProps,
  children,
}) => {
  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#E8EAED] flex flex-col md:flex-row">
      {/* Desktop Sidebar (hidden on mobile) */}
      <Sidebar
        currentPath={currentPath}
        userEmail={userEmail}
        dailyJobsUsed={dailyJobsUsed}
        dailyJobsLimit={dailyJobsLimit}
        onSignOut={onSignOut}
        className="hidden md:flex sticky top-0"
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6">
        {topBarProps && <TopBar {...topBarProps} />}
        <main className="flex-1 p-4 md:p-8 max-w-[1280px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav (hidden on desktop/tablet) */}
      <BottomNav currentPath={currentPath} />
    </div>
  );
};
