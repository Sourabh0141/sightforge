import React from "react";
import {
  Button,
  ArrowRightIcon,
  SparklesIcon,
  LayersIcon,
} from "@sightforge/ui";

export default function HomePage() {
  const tasks = [
    {
      slug: "detection",
      title: "Object Detection",
      desc: "Bounding boxes with class & confidence",
    },
    {
      slug: "instance-segmentation",
      title: "Instance Segmentation",
      desc: "Pixel-accurate object masks",
    },
    {
      slug: "semantic-segmentation",
      title: "Semantic Segmentation",
      desc: "Dense per-pixel class maps",
    },
    {
      slug: "classification",
      title: "Classification",
      desc: "Ranked category probabilities",
    },
    {
      slug: "pose",
      title: "Pose Estimation",
      desc: "17-keypoint skeleton topology",
    },
    {
      slug: "obb",
      title: "Oriented Bounding Box",
      desc: "Rotated boxes for angled targets",
    },
    {
      slug: "depth",
      title: "Depth Estimation",
      desc: "16-bit metric monocular depth",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#E8EAED] flex flex-col justify-between">
      {/* Top sticky navigation bar */}
      <header className="sticky top-0 z-40 h-16 border-b border-[#252B37] bg-[#0A0C10]/80 backdrop-blur-md px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#22D3EE]/10 border border-[#22D3EE]/30 text-[#22D3EE]">
            <SparklesIcon size={16} />
          </div>
          <span className="font-semibold text-base tracking-tight text-[#E8EAED]">
            SightForge
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="/gallery"
            className="text-sm text-[#9AA3B2] hover:text-[#E8EAED] transition-colors"
          >
            Demo
          </a>
          <a
            href="https://github.com/Sourabh0141/sightforge"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#9AA3B2] hover:text-[#E8EAED] transition-colors"
          >
            Source
          </a>
          <a
            href="/signin"
            className="text-sm text-[#9AA3B2] hover:text-[#E8EAED] transition-colors"
          >
            Sign in
          </a>
          <Button href="/signup" size="sm" variant="primary">
            Get started
          </Button>
        </div>
      </header>

      {/* Hero section */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-16 md:py-24 space-y-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A1F29] border border-[#252B37] text-xs font-mono text-[#22D3EE]">
              <span>7 Computer Vision Tasks · 1 Upload</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[#E8EAED] leading-tight">
              Precision computer vision for software engineers.
            </h1>
            <p className="text-lg text-[#9AA3B2] max-w-xl leading-relaxed">
              Upload an image or a clip under 30 seconds. Pick a task, watch
              real-time inference over WebSockets, and inspect structured
              results on canvas or as JSON.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Button
                href="/gallery"
                size="lg"
                variant="primary"
                rightIcon={<ArrowRightIcon size={16} />}
              >
                See it working
              </Button>
              <Button href="/signup" size="lg" variant="secondary">
                Create an account
              </Button>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#12151C] border border-[#252B37] rounded-[8px] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#252B37] pb-3">
              <span className="text-xs font-mono text-[#9AA3B2]">
                Live inference output
              </span>
              <span className="text-xs font-mono text-[#22D3EE]">v1.0.0</span>
            </div>
            <div className="h-64 bg-[#1A1F29] rounded-[6px] border border-[#252B37] flex items-center justify-center relative overflow-hidden group">
              <img
                src="/assets/visual-object-detection.png"
                alt="Object detection demo visual"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-[#0A0C10]/90 border border-[#252B37] text-[11px] font-mono text-[#22D3EE]">
                person 0.94 · [120, 45, 310, 580]
              </div>
            </div>
          </div>
        </div>

        {/* Task strip */}
        <div className="space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-wider text-[#9AA3B2]">
            Supported Vision Tasks
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tasks.map((t, idx) => (
              <a
                key={idx}
                href={`/gallery/${t.slug}`}
                className="group p-4 rounded-[8px] bg-[#12151C] border border-[#252B37] hover:border-[#22D3EE]/50 transition-all motion-safe:hover:-translate-y-0.5 space-y-2 block focus:outline-none focus:ring-2 focus:ring-[#22D3EE]"
              >
                <div className="flex items-center gap-2 text-[#22D3EE]">
                  <LayersIcon size={16} />
                  <h3 className="text-sm font-semibold text-[#E8EAED] group-hover:text-[#22D3EE] transition-colors">
                    {t.title}
                  </h3>
                </div>
                <p className="text-xs text-[#9AA3B2]">{t.desc}</p>
              </a>
            ))}
          </div>
        </div>

        {/* Technical credibility stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-8 rounded-[8px] bg-[#12151C] border border-[#252B37]">
          <div className="space-y-1">
            <div className="text-2xl font-bold font-mono text-[#22D3EE]">
              7 Tasks
            </div>
            <div className="text-xs text-[#9AA3B2]">
              Detection to 16-bit depth
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold font-mono text-[#22D3EE]">
              Argon2id
            </div>
            <div className="text-xs text-[#9AA3B2]">
              In-browser zero-knowledge
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold font-mono text-[#22D3EE]">
              Serverless
            </div>
            <div className="text-xs text-[#9AA3B2]">
              Scale-to-zero GPU pipeline
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold font-mono text-[#22D3EE]">
              AGPL-3.0
            </div>
            <div className="text-xs text-[#9AA3B2]">
              100% open source codebase
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#252B37] py-6 px-6 text-center text-xs text-[#6B7280]">
        SightForge — High-performance computer vision platform · Open source
        under AGPL-3.0
      </footer>
    </div>
  );
}
