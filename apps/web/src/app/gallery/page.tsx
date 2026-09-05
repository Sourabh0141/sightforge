import React from "react";
import {
  Button,
  ArrowLeftIcon,
  ArrowRightIcon,
  SparklesIcon,
  FileVideoIcon,
  LayersIcon,
} from "@sightforge/ui";
import { GALLERY_ORDER, GALLERY_TASK_MAP } from "@/lib/gallery-fixtures";

export default function GalleryIndexPage() {
  const galleryItems = GALLERY_ORDER.map((slug) => GALLERY_TASK_MAP[slug]!);

  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#E8EAED] flex flex-col justify-between">
      {/* Navigation */}
      <header className="sticky top-0 z-40 h-16 border-b border-[#252B37] bg-[#0A0C10]/80 backdrop-blur-md px-6 flex items-center justify-between">
        <a
          href="/"
          className="flex items-center gap-2 text-sm text-[#9AA3B2] hover:text-[#E8EAED] transition-colors focus:outline-none focus:ring-2 focus:ring-[#22D3EE] rounded"
        >
          <ArrowLeftIcon size={16} />
          <span>Home</span>
        </a>
        <div className="flex items-center gap-2 font-semibold text-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-[#22D3EE]/10 border border-[#22D3EE]/30 text-[#22D3EE]">
            <SparklesIcon size={14} />
          </div>
          <span>Demo Gallery</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/signin"
            className="text-xs text-[#9AA3B2] hover:text-[#E8EAED] transition-colors hidden sm:inline-block"
          >
            Sign in
          </a>
          <Button href="/signup" size="sm" variant="primary">
            Create account
          </Button>
        </div>
      </header>

      {/* Gallery content */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-12 space-y-8">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1A1F29] border border-[#252B37] text-xs font-mono text-[#22D3EE]">
            <LayersIcon size={12} />
            <span>Unauthenticated Demo · All 7 Vision Tasks + Tracking</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#E8EAED]">
            See it working
          </h1>
          <p className="text-sm md:text-base text-[#9AA3B2] max-w-2xl leading-relaxed">
            Real analysis results from every computer vision task, pre-computed
            so you can inspect immediately without signing up or waiting on a
            serverless cold start.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {galleryItems.map((item) => (
            <a
              key={item.slug}
              href={`/gallery/${item.slug}`}
              className="group block rounded-[8px] bg-[#12151C] border border-[#252B37] hover:border-[#22D3EE]/60 transition-all duration-200 overflow-hidden motion-safe:hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#22D3EE]"
            >
              <div className="h-48 bg-[#1A1F29] relative overflow-hidden border-b border-[#252B37]">
                <img
                  src={item.mediaUrl}
                  alt={`${item.title} result visualization`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {item.isVideo ? (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#0A0C10]/90 border border-[#22D3EE]/40 text-[10px] font-mono font-semibold text-[#22D3EE] flex items-center gap-1 shadow-sm">
                    <FileVideoIcon size={12} />
                    VIDEO
                  </span>
                ) : (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#0A0C10]/80 border border-[#252B37] text-[10px] font-mono text-[#9AA3B2]">
                    STILL
                  </span>
                )}
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[#E8EAED] group-hover:text-[#22D3EE] transition-colors">
                    {item.title}
                  </h2>
                  <ArrowRightIcon
                    size={14}
                    className="text-[#6B7280] group-hover:text-[#22D3EE] group-hover:translate-x-0.5 transition-all"
                  />
                </div>
                <p className="text-xs text-[#9AA3B2] line-clamp-2 leading-relaxed">
                  {item.shortDesc}
                </p>
                <div className="pt-2 border-t border-[#252B37]/60">
                  <p className="text-[11px] font-mono text-[#22D3EE]/90 truncate">
                    {item.meta}
                  </p>
                </div>
              </div>
            </a>
          ))}
        </div>
      </main>

      {/* Footer CTA Band */}
      <footer className="border-t border-[#252B37] bg-[#12151C]/40 py-10 px-6 text-center space-y-4">
        <div className="max-w-md mx-auto space-y-2">
          <h3 className="text-base font-semibold text-[#E8EAED]">
            Ready to run analysis on your own media?
          </h3>
          <p className="text-xs text-[#9AA3B2] leading-relaxed">
            Create a free account to upload custom images and videos, adjust
            inference confidence thresholds, and stream live GPU execution over
            WebSockets.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Button
            href="/signup"
            variant="primary"
            size="md"
            rightIcon={<ArrowRightIcon size={16} />}
          >
            Create your account
          </Button>
          <Button
            href="https://github.com/Sourabh0141/sightforge"
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="md"
          >
            Read the source
          </Button>
        </div>
      </footer>
    </div>
  );
}
