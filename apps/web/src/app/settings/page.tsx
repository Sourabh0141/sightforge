"use client";

import React from "react";
import { AppShell, Card, Button } from "@sightforge/ui";

export default function SettingsPage() {
  return (
    <AppShell
      currentPath="/settings"
      topBarProps={{
        title: "Account Settings",
        subtitle: "Usage, data retention, and preferences",
      }}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Account card */}
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-[#E8EAED]">Account</h2>
          <p className="text-xs font-mono text-[#9AA3B2]">
            developer@sightforge.dev
          </p>
        </Card>

        {/* Usage card */}
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-[#E8EAED]">
            Usage & Limits
          </h2>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <span className="text-[#9AA3B2]">Today:</span> 7 / 50 jobs
            </div>
            <div>
              <span className="text-[#9AA3B2]">All time:</span> 42 jobs
            </div>
          </div>
        </Card>

        {/* Danger zone */}
        <Card variant="danger" className="space-y-4">
          <h2 className="text-sm font-semibold text-[#F87171]">Danger Zone</h2>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-medium text-[#E8EAED]">
                Delete all jobs
              </h3>
              <p className="text-[11px] text-[#9AA3B2]">
                Permanently remove all jobs and result documents
              </p>
            </div>
            <Button size="sm" variant="danger">
              Delete all
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
