import React from "react";
import {
  Button,
  ArrowLeftIcon,
  SparklesIcon,
  ViewerShell,
} from "@sightforge/ui";
import { GALLERY_TASK_MAP } from "@/lib/gallery-fixtures";

export async function generateStaticParams() {
  return [
    { task: "detection" },
    { task: "instance-segmentation" },
    { task: "semantic-segmentation" },
    { task: "classification" },
    { task: "pose" },
    { task: "obb" },
    { task: "depth" },
    { task: "tracking" },
  ];
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

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#E8EAED] flex flex-col justify-between">
      <header className="h-16 border-b border-[#252B37] px-6 flex items-center justify-between">
        <a
          href="/gallery"
          className="flex items-center gap-2 text-sm text-[#9AA3B2] hover:text-[#E8EAED] transition-colors"
        >
          <ArrowLeftIcon size={16} />
          <span>Gallery Index</span>
        </a>
        <div className="flex items-center gap-2 font-semibold text-sm">
          <SparklesIcon size={16} className="text-[#22D3EE]" />
          <span>{formattedTask}</span>
        </div>
        <a href="/signup">
          <Button size="sm" variant="primary">
            Run your own
          </Button>
        </a>
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#E8EAED]">
              {formattedTask}
            </h1>
            <p className="text-xs text-[#9AA3B2]">
              {taskMeta?.description ||
                "Pre-computed inference result fixture (read-only demo)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#1A1F29] border border-[#252B37] text-[#22D3EE]">
              Contract v1.0.0
            </span>
          </div>
        </div>

        {taskMeta ? (
          <ViewerShell
            document={taskMeta.document}
            mediaUrl={taskMeta.mediaUrl}
            readOnly
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 bg-[#12151C] border border-[#252B37] rounded-[8px] p-4 flex items-center justify-center min-h-[460px]">
              <img
                src={`/assets/visual-${task}.png`}
                alt={`${formattedTask} result`}
                className="max-h-[500px] w-auto object-contain rounded"
              />
            </div>
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-[#12151C] border border-[#252B37] rounded-[8px] p-6 space-y-3">
                <h2 className="text-sm font-semibold text-[#E8EAED]">
                  About this task
                </h2>
                <p className="text-xs text-[#9AA3B2] leading-relaxed">
                  Demonstrates real output shapes produced by the SightForge
                  inference service.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
