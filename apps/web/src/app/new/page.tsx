"use client";

import React from "react";
import { AppShell, Card, Button, UploadCloudIcon } from "@sightforge/ui";

export default function NewJobPage() {
  return (
    <AppShell
      currentPath="/new"
      topBarProps={{
        title: "New Job",
        subtitle: "Configure media and analysis task",
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Media dropzone preview */}
        <div className="lg:col-span-7">
          <Card className="h-[420px] flex flex-col items-center justify-center border-dashed border-2 border-[#252B37] hover:border-[#22D3EE]/50 transition-colors text-center p-8">
            <UploadCloudIcon size={48} className="text-[#9AA3B2] mb-4" />
            <h3 className="text-base font-semibold text-[#E8EAED] mb-1">
              Drop an image or video here
            </h3>
            <p className="text-xs text-[#9AA3B2] mb-4">
              or click to browse files
            </p>
            <span className="text-[11px] font-mono text-[#6B7280]">
              JPEG, PNG, WebP up to 10 MB · MP4 up to 50 MB and 30 seconds
            </span>
          </Card>
        </div>

        {/* Configuration panel */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="space-y-4">
            <h2 className="text-sm font-semibold text-[#E8EAED] pb-2 border-b border-[#252B37]">
              Task Configuration
            </h2>
            <p className="text-xs text-[#9AA3B2]">
              Select vision task and configure model size, inference mode, and
              confidence threshold.
            </p>
            <Button variant="primary" className="w-full justify-center">
              Run analysis
            </Button>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
