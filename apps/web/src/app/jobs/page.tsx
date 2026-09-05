/**
 * SightForge Job History & Live Execution Dashboard (P4 U5, R54, R55, R57, R58)
 *
 * Implements the full job history list, status filters, search, and the single-job
 * live status stage tracker transitioning into full results viewer on completion.
 */

"use client";

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  AppShell,
  Card,
  Button,
  EmptyState,
  JobListSkeleton,
  ViewerShell,
} from "@sightforge/ui";
import type { SightForgeResultDocument } from "@sightforge/contracts";
import { useJobStatus } from "../../lib/use-job-status";
import {
  JobFilterBar,
  type JobFilterState,
} from "../../components/JobFilterBar";
import { JobHistoryRow, type JobRecord } from "../../components/JobHistoryRow";
import { JobStageTracker } from "../../components/JobStageTracker";
import { api } from "../../lib/api-client";

interface ListJobsResponse {
  jobs: JobRecord[];
  limit: number;
  offset: number;
}

interface ResultsResponse {
  jobId: string;
  resultKey: string;
  downloadUrl: string;
  expiresInSeconds: number;
}

interface DenseArtifactResponse {
  jobId: string;
  denseArtifactKey: string;
  downloadUrl: string;
  expiresInSeconds: number;
}

/**
 * Single Job Detail & Live Viewer Component
 */
function SingleJobView({ jobId }: { jobId: string }) {
  const router = useRouter();
  const { data: jobStatus, isLoading, cancelJob } = useJobStatus(jobId);

  const [resultDocument, setResultDocument] =
    useState<SightForgeResultDocument | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  // Fetch presigned result document when job reaches completed state
  useEffect(() => {
    if (!jobStatus || jobStatus.status !== "completed") {
      setResultDocument(null);
      return;
    }

    let isMounted = true;
    const fetchResults = async () => {
      setIsLoadingResults(true);
      setResultsError(null);
      try {
        const res = await api.get<ResultsResponse>(`/jobs/${jobId}/results`);
        const jsonRes = await fetch(res.downloadUrl);
        if (!jsonRes.ok) {
          throw new Error("Failed to download result payload from storage.");
        }
        const doc = (await jsonRes.json()) as SightForgeResultDocument;
        if (isMounted) {
          setResultDocument(doc);
        }
      } catch (err) {
        if (isMounted) {
          setResultsError(
            err instanceof Error
              ? err.message
              : "Unable to retrieve completed result document.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingResults(false);
        }
      }
    };

    void fetchResults();

    return () => {
      isMounted = false;
    };
  }, [jobId, jobStatus?.status]);

  const resolveArtifact = useCallback(
    async (_key: string): Promise<string> => {
      try {
        const res = await api.get<DenseArtifactResponse>(
          `/jobs/${jobId}/results/dense-artifact`,
        );
        return res.downloadUrl;
      } catch {
        return "";
      }
    },
    [jobId],
  );

  const handleDelete = async () => {
    if (confirm("Are you sure you want to permanently delete this job?")) {
      await api.delete(`/jobs/${jobId}`);
      router.push("/jobs");
    }
  };

  if (isLoading || (!jobStatus && !resultsError)) {
    return <JobListSkeleton />;
  }

  if (!jobStatus) {
    return (
      <EmptyState
        type="no-jobs"
        title="Job not found"
        description="The requested job does not exist or may have been deleted."
        primaryActionLabel="Back to all jobs"
        primaryActionHref="/jobs"
      />
    );
  }

  // State A: In-progress, Queued, Failed, or Cancelled -> Render Stage Tracker
  if (jobStatus.status !== "completed") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <a
            href="/jobs"
            className="text-xs font-mono text-[#9AA3B2] hover:text-[#22D3EE] transition-colors flex items-center gap-1.5"
          >
            <span>← Back to all jobs</span>
          </a>
        </div>

        <JobStageTracker
          data={jobStatus}
          onCancel={cancelJob}
          onRetry={() => router.push("/new")}
        />
      </div>
    );
  }

  // State B: Completed -> Render Full Results Viewer Shell (R55, R57, R66)
  if (isLoadingResults) {
    return (
      <Card className="p-12 text-center bg-[#12151C] border-[#252B37] space-y-4">
        <div className="w-8 h-8 rounded-full border-2 border-[#22D3EE] border-t-transparent animate-spin mx-auto" />
        <p className="text-sm text-[#E8EAED] font-mono">
          Loading structured results payload…
        </p>
      </Card>
    );
  }

  if (resultsError || !resultDocument) {
    return (
      <Card className="p-8 bg-[#12151C] border-[#F87171]/40 space-y-4 text-center">
        <h3 className="text-sm font-semibold text-[#F87171]">
          Failed to Load Result Document
        </h3>
        <p className="text-xs text-[#9AA3B2]">
          {resultsError ||
            "The results document could not be decoded or may have expired."}
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => router.push("/jobs")}
        >
          Back to history
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top back navigation and actions */}
      <div className="flex items-center justify-between">
        <a
          href="/jobs"
          className="text-xs font-mono text-[#9AA3B2] hover:text-[#22D3EE] transition-colors flex items-center gap-1.5"
        >
          <span>← Back to all jobs</span>
        </a>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => router.push("/new")}
          >
            Run another
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleDelete}
            className="text-[#F87171] hover:bg-[#F87171]/10 border-[#F87171]/30"
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Unified Viewer Shell */}
      <ViewerShell
        document={resultDocument}
        resolveArtifact={resolveArtifact}
      />
    </div>
  );
}

/**
 * Main Job History Dashboard Component
 */
function JobsHistoryDashboard() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<JobFilterState>({
    status: "all",
    task: "all",
    search: "",
  });

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<ListJobsResponse>("/jobs?limit=100");
      setJobs(data.jobs || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load job history.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const handleDeleteJob = async (jobId: string) => {
    await api.delete(`/jobs/${jobId}`);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  const handleCancelJob = async (jobId: string) => {
    await api.post(`/jobs/${jobId}/cancel`);
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? { ...j, status: "cancelled", updatedAt: new Date().toISOString() }
          : j,
      ),
    );
  };

  // Client-side filtering across status, task, and search query
  const filteredJobs = jobs.filter((job) => {
    // Status filter
    if (filters.status === "running") {
      const isRunning =
        job.status === "created" ||
        job.status === "uploading" ||
        job.status === "queued" ||
        job.status === "processing";
      if (!isRunning) return false;
    } else if (filters.status !== "all" && job.status !== filters.status) {
      return false;
    }

    // Task filter
    if (filters.task !== "all" && job.task !== filters.task) {
      return false;
    }

    // Search query filter
    if (filters.search.trim()) {
      const query = filters.search.toLowerCase();
      const matchesName = job.originalFilename?.toLowerCase().includes(query);
      const matchesId = job.id.toLowerCase().includes(query);
      const matchesTask = job.task.toLowerCase().includes(query);
      if (!matchesName && !matchesId && !matchesTask) return false;
    }

    return true;
  });

  if (isLoading) {
    return <JobListSkeleton />;
  }

  if (error) {
    return (
      <Card className="p-8 bg-[#12151C] border-[#F87171]/40 text-center space-y-4">
        <h3 className="text-sm font-semibold text-[#F87171]">
          Error Loading History
        </h3>
        <p className="text-xs text-[#9AA3B2]">{error}</p>
        <Button size="sm" variant="secondary" onClick={() => void loadJobs()}>
          Retry
        </Button>
      </Card>
    );
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        type="no-jobs"
        title="No jobs yet"
        description="Upload an image or a short video clip to run object detection, pose estimation, depth maps, and more."
        primaryActionLabel="Run your first job"
        primaryActionHref="/new"
        secondaryActionLabel="Or look at the demo gallery"
        secondaryActionHref="/gallery"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#E8EAED]">
            Your jobs
          </h1>
          <p className="text-xs text-[#9AA3B2]">
            {jobs.length} total computer vision{" "}
            {jobs.length === 1 ? "analysis" : "analyses"} recorded
          </p>
        </div>
        <a href="/new">
          <Button variant="primary" size="sm">
            New job
          </Button>
        </a>
      </div>

      {/* Filter Bar */}
      <JobFilterBar
        filters={filters}
        onChange={setFilters}
        totalCount={jobs.length}
        filteredCount={filteredJobs.length}
      />

      {/* Job List Rows */}
      {filteredJobs.length === 0 ? (
        <Card className="p-8 text-center bg-[#12151C] border-[#252B37] space-y-3">
          <p className="text-xs text-[#9AA3B2]">
            No jobs match your current filter criteria.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setFilters({ status: "all", task: "all", search: "" })
            }
          >
            Clear filters
          </Button>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filteredJobs.map((job) => (
            <JobHistoryRow
              key={job.id}
              job={job}
              onDelete={handleDeleteJob}
              onCancel={handleCancelJob}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Main Controller handling query-parameterized routing under static export (KTD1, R53)
 */
function JobsPageContent() {
  const searchParams = useSearchParams();
  const selectedJobId = searchParams.get("id");

  if (selectedJobId) {
    return <SingleJobView jobId={selectedJobId} />;
  }

  return <JobsHistoryDashboard />;
}

export default function JobsPage() {
  return (
    <AppShell
      currentPath="/jobs"
      topBarProps={{
        title: "Jobs",
        subtitle: "Analysis history and live status",
      }}
    >
      <Suspense fallback={<JobListSkeleton />}>
        <JobsPageContent />
      </Suspense>
    </AppShell>
  );
}
