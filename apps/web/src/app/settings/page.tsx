/**
 * SightForge Account Settings & Danger Zone Page (P4 U5, Screen 14, R105, R111)
 *
 * Exposes user credentials metadata, daily usage telemetry against account quotas,
 * fixed data retention policies, and cascade deletion danger zone modals.
 */

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Card, Button } from "@sightforge/ui";
import { useAuth } from "../../lib/auth/auth-context";
import { DangerZoneModal } from "../../components/DangerZoneModal";
import { api } from "../../lib/api-client";
import type { JobRecord } from "../../components/JobHistoryRow";

interface ListJobsResponse {
  jobs: JobRecord[];
  limit: number;
  offset: number;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);

  // Danger modal states
  const [isDeleteJobsModalOpen, setIsDeleteJobsModalOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] =
    useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get<ListJobsResponse>("/jobs?limit=100");
        setJobs(res.jobs || []);
      } catch {
        // Fallback to empty stats
      } finally {
        setIsLoadingJobs(false);
      }
    };

    void fetchStats();
  }, []);

  // Compute daily usage stats (jobs created in last 24 hours UTC)
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const jobsTodayCount = jobs.filter((j) => {
    const createdTime = new Date(j.createdAt).getTime();
    return createdTime >= oneDayAgo;
  }).length;

  const dailyQuota = 50;
  const quotaPercentage = Math.min(
    100,
    Math.round((jobsTodayCount / dailyQuota) * 100),
  );

  // Compute storage estimate (~250 KB per completed job + media)
  const estimatedStorageMb = (jobs.length * 0.25).toFixed(1);

  const handleDeleteAllJobs = async () => {
    // Delete all jobs sequentially or in parallel
    await Promise.all(
      jobs.map((job) => api.delete(`/jobs/${job.id}`).catch(() => {})),
    );
    setJobs([]);
  };

  const handleDeleteAccount = async () => {
    await api.delete("/account");
    await logout();
    router.push("/");
  };

  return (
    <AppShell
      currentPath="/settings"
      topBarProps={{
        title: "Account Settings",
        subtitle: "Usage, data retention, and preferences",
      }}
    >
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 1. Account Information */}
        <Card className="space-y-3 bg-[#12151C] border-[#252B37] p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AA3B2]">
            Account
          </h2>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-mono text-[#E8EAED]">
                {user?.email || "developer@sightforge.dev"}
              </span>
              <span className="text-[11px] font-mono text-[#6B7280] block">
                User ID: {user?.id || "usr_anonymous"}
              </span>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/20">
              Signed in
            </span>
          </div>
        </Card>

        {/* 2. Usage & Limits */}
        <Card className="space-y-4 bg-[#12151C] border-[#252B37] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AA3B2]">
              Usage &amp; Quotas
            </h2>
            <span className="text-[11px] font-mono text-[#6B7280]">
              Resets daily at 00:00 UTC
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-3 bg-[#1A1F29] rounded-[6px] border border-[#252B37]">
              <span className="text-[#9AA3B2] block text-[10px] uppercase">
                Jobs Today
              </span>
              <span className="text-base font-semibold text-[#E8EAED]">
                {isLoadingJobs ? "…" : jobsTodayCount}{" "}
                <span className="text-xs text-[#6B7280]">/ {dailyQuota}</span>
              </span>
            </div>

            <div className="p-3 bg-[#1A1F29] rounded-[6px] border border-[#252B37]">
              <span className="text-[#9AA3B2] block text-[10px] uppercase">
                All-Time Jobs
              </span>
              <span className="text-base font-semibold text-[#E8EAED]">
                {isLoadingJobs ? "…" : jobs.length}
              </span>
            </div>

            <div className="p-3 bg-[#1A1F29] rounded-[6px] border border-[#252B37]">
              <span className="text-[#9AA3B2] block text-[10px] uppercase">
                Storage Used
              </span>
              <span className="text-base font-semibold text-[#22D3EE]">
                ~{isLoadingJobs ? "…" : estimatedStorageMb} MB
              </span>
            </div>
          </div>

          {/* Daily Quota Progress Bar */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-[#9AA3B2]">Daily Job Allowance</span>
              <span className="text-[#E8EAED]">{quotaPercentage}% used</span>
            </div>
            <div className="w-full h-2 bg-[#1A1F29] rounded-full overflow-hidden border border-[#252B37]">
              <div
                className={`h-full transition-all duration-300 ${
                  quotaPercentage > 85 ? "bg-[#FBBF24]" : "bg-[#22D3EE]"
                }`}
                style={{ width: `${Math.max(2, quotaPercentage)}%` }}
              />
            </div>
          </div>
        </Card>

        {/* 3. Data Retention Policy */}
        <Card className="space-y-3 bg-[#12151C] border-[#252B37] p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#9AA3B2]">
            Data Retention Rules
          </h2>
          <p className="text-xs text-[#9AA3B2]">
            SightForge enforces automated platform lifecycle rules to bound
            storage consumption:
          </p>
          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-[#252B37]/60">
              <span className="text-[#E8EAED]">Completed job media</span>
              <span className="font-mono text-[#9AA3B2]">7 days retention</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[#252B37]/60">
              <span className="text-[#E8EAED]">
                Failed job media (for diagnostics)
              </span>
              <span className="font-mono text-[#9AA3B2]">
                14 days retention
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[#E8EAED]">
                Structured inference results
              </span>
              <span className="font-mono text-[#22D3EE]">
                30 days retention
              </span>
            </div>
          </div>
        </Card>

        {/* 4. Danger Zone */}
        <Card className="space-y-5 bg-[#12151C] border border-[#F87171]/30 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#F87171]">
            Danger Zone
          </h2>

          <div className="space-y-4 divide-y divide-[#252B37]">
            {/* Action 1: Delete all jobs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold text-[#E8EAED]">
                  Delete all jobs
                </h3>
                <p className="text-[11px] text-[#9AA3B2]">
                  Permanently removes all jobs, media uploads, and structured
                  results while preserving your account.
                </p>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setIsDeleteJobsModalOpen(true)}
                disabled={jobs.length === 0}
                className="shrink-0"
              >
                Delete all jobs
              </Button>
            </div>

            {/* Action 2: Delete account */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold text-[#F87171]">
                  Delete account
                </h3>
                <p className="text-[11px] text-[#9AA3B2]">
                  Permanently deletes your account credentials, session tokens,
                  all jobs, and stored artifacts.
                </p>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setIsDeleteAccountModalOpen(true)}
                className="shrink-0 bg-[#F87171]/20 hover:bg-[#F87171]/30 border-[#F87171]/50 text-[#F87171]"
              >
                Delete account
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Danger Zone Modals */}
      <DangerZoneModal
        isOpen={isDeleteJobsModalOpen}
        onClose={() => setIsDeleteJobsModalOpen(false)}
        onConfirm={handleDeleteAllJobs}
        title="Delete All Jobs"
        description="This action cannot be undone. All your recorded analysis jobs, uploaded media files, and inference results will be permanently erased."
        itemsToDelete={[
          { label: "Job records", count: jobs.length },
          { label: "Uploaded source files", count: jobs.length },
          {
            label: "Result documents & masks",
            count: jobs.filter((j) => j.status === "completed").length,
          },
        ]}
        confirmButtonLabel="Delete all jobs"
      />

      <DangerZoneModal
        isOpen={isDeleteAccountModalOpen}
        onClose={() => setIsDeleteAccountModalOpen(false)}
        onConfirm={handleDeleteAccount}
        title="Delete Account & All Data"
        description="This will permanently delete your SightForge account. All user records, authentication credentials, jobs, and stored media will be irrecoverably purged."
        itemsToDelete={[
          { label: "User account & credentials", count: 1 },
          { label: "Active session tokens", count: 1 },
          { label: "Job records & files", count: jobs.length },
        ]}
        confirmButtonLabel="Permanently delete account"
      />
    </AppShell>
  );
}
