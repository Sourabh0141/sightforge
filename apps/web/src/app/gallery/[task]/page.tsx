import React from "react";
import {
  Button,
  ArrowLeftIcon,
  SparklesIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@sightforge/ui";
import {
  GALLERY_ORDER,
  GALLERY_TASK_MAP,
  getAdjacentGalleryTasks,
  getGalleryStaticParams,
} from "@/lib/gallery-fixtures";
import { GalleryTaskClient } from "./GalleryTaskClient";

export async function generateStaticParams() {
  return getGalleryStaticParams();
}

interface GalleryTaskProps {
  params: Promise<{ task: string }>;
}

export default async function GalleryTaskPage({ params }: GalleryTaskProps) {
  const { task } = await params;
  const taskMeta = GALLERY_TASK_MAP[task];
  const formattedTask =
    taskMeta?.title ||
    task.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  const { prev, next } = getAdjacentGalleryTasks(task);

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#E8EAED] flex flex-col justify-between">
      {/* Top Bar with Gallery Navigation & Prev/Next Cycling */}
      <header className="sticky top-0 z-40 h-16 border-b border-[#252B37] bg-[#0A0C10]/80 backdrop-blur-md px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a
            href="/gallery"
            className="flex items-center gap-2 text-sm text-[#9AA3B2] hover:text-[#E8EAED] transition-colors focus:outline-none focus:ring-2 focus:ring-[#22D3EE] rounded"
          >
            <ArrowLeftIcon size={16} />
            <span>Gallery Index</span>
          </a>

          <div className="hidden sm:flex items-center gap-1 border-l border-[#252B37] pl-4">
            <a
              href={`/gallery/${prev.slug}`}
              title={`Previous: ${prev.title}`}
              className="p-1.5 rounded text-[#9AA3B2] hover:text-[#E8EAED] hover:bg-[#1A1F29] transition-colors focus:outline-none focus:ring-2 focus:ring-[#22D3EE]"
            >
              <ChevronLeftIcon size={16} />
            </a>
            <span className="text-xs font-mono text-[#6B7280] px-1">
              {GALLERY_ORDER.indexOf(task) + 1} / {GALLERY_ORDER.length}
            </span>
            <a
              href={`/gallery/${next.slug}`}
              title={`Next: ${next.title}`}
              className="p-1.5 rounded text-[#9AA3B2] hover:text-[#E8EAED] hover:bg-[#1A1F29] transition-colors focus:outline-none focus:ring-2 focus:ring-[#22D3EE]"
            >
              <ChevronRightIcon size={16} />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2 font-semibold text-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-[#22D3EE]/10 border border-[#22D3EE]/30 text-[#22D3EE]">
            <SparklesIcon size={14} />
          </div>
          <span>{formattedTask}</span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/signin"
            className="text-xs text-[#9AA3B2] hover:text-[#E8EAED] transition-colors hidden sm:inline-block"
          >
            Sign in
          </a>
          <a href="/signup">
            <Button size="sm" variant="primary">
              Run your own
            </Button>
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#252B37] pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#E8EAED]">
                {formattedTask}
              </h1>
              {taskMeta?.isVideo && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#22D3EE]/10 border border-[#22D3EE]/40 text-[#22D3EE]">
                  VIDEO
                </span>
              )}
            </div>
            <p className="text-xs md:text-sm text-[#9AA3B2]">
              {taskMeta?.shortDesc ||
                "Pre-computed inference result fixture (read-only demo)"}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-2.5 py-1 rounded text-xs font-mono bg-[#1A1F29] border border-[#252B37] text-[#22D3EE]">
              Contract v{taskMeta?.document?.schema_version || "1.0.0"}
            </span>
          </div>
        </div>

        {taskMeta ? (
          <GalleryTaskClient taskMeta={taskMeta} />
        ) : (
          <div className="bg-[#12151C] border border-[#252B37] rounded-[8px] p-8 text-center space-y-4">
            <p className="text-sm text-[#9AA3B2]">Task fixture not found.</p>
            <a href="/gallery">
              <Button variant="secondary" size="sm">
                Back to Gallery
              </Button>
            </a>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#252B37] bg-[#12151C]/40 py-6 px-6 text-center text-xs text-[#6B7280]">
        SightForge Demo Gallery — Pre-computed result fixtures for
        unauthenticated evaluation
      </footer>
    </div>
  );
}
