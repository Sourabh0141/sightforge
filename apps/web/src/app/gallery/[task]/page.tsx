import React from "react";
import { Button, ArrowLeftIcon, SparklesIcon } from "@sightforge/ui";

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
  const formattedTask = task
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

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

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#E8EAED]">
              {formattedTask}
            </h1>
            <p className="text-xs text-[#9AA3B2]">
              Pre-computed inference result fixture (read-only demo)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 bg-[#12151C] border border-[#252B37] rounded-[8px] p-4 flex items-center justify-center min-h-[460px]">
            <img
              src={`/assets/visual-${task === "tracking" ? "video-object-tracking" : task === "obb" ? "oriented-bounding-boxes" : task}.png`}
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
      </main>
    </div>
  );
}
