"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell, EmptyState, JobListSkeleton } from "@sightforge/ui";

function JobsContent() {
  const searchParams = useSearchParams();
  const selectedJobId = searchParams.get("id");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#E8EAED]">
            Your jobs
          </h1>
          <p className="text-xs text-[#9AA3B2]">
            Track and inspect your computer vision analysis history
          </p>
        </div>
      </div>

      {selectedJobId ? (
        <div className="p-4 bg-[#12151C] border border-[#252B37] rounded-[8px] space-y-2">
          <span className="text-xs font-mono text-[#22D3EE]">
            Job ID: {selectedJobId}
          </span>
          <p className="text-sm text-[#9AA3B2]">Loading job details…</p>
        </div>
      ) : (
        <EmptyState
          type="no-jobs"
          title="No jobs yet"
          description="Upload an image or a short video clip to run object detection, pose estimation, depth maps, and more."
          primaryActionLabel="Run your first job"
          primaryActionHref="/new"
          secondaryActionLabel="Or look at the demo gallery"
          secondaryActionHref="/gallery"
        />
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <AppShell
      currentPath="/jobs"
      topBarProps={{ title: "Jobs", subtitle: "Analysis history" }}
    >
      <Suspense fallback={<JobListSkeleton />}>
        <JobsContent />
      </Suspense>
    </AppShell>
  );
}
