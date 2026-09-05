import React from "react";
import {
  Button,
  ArrowLeftIcon,
  ArrowRightIcon,
  SparklesIcon,
} from "@sightforge/ui";

const GALLERY_ITEMS = [
  {
    slug: "detection",
    title: "Object Detection",
    image: "/assets/visual-object-detection.png",
    meta: "14 objects · 640×640 · 41ms",
  },
  {
    slug: "instance-segmentation",
    title: "Instance Segmentation",
    image: "/assets/visual-instance-segmentation.png",
    meta: "8 masks · 640×640 · 58ms",
  },
  {
    slug: "semantic-segmentation",
    title: "Semantic Segmentation",
    image: "/assets/visual-semantic-segmentation.png",
    meta: "Dense map · 640×640 · 62ms",
  },
  {
    slug: "classification",
    title: "Classification",
    image: "/assets/visual-classification.png",
    meta: "Top 5 classes · 224×224 · 12ms",
  },
  {
    slug: "pose",
    title: "Pose Estimation",
    image: "/assets/visual-pose-estimation.png",
    meta: "3 skeletons · 17 keypoints · 45ms",
  },
  {
    slug: "obb",
    title: "Oriented Bounding Box",
    image: "/assets/visual-oriented-bounding-boxes.png",
    meta: "12 rotated boxes · 640×640 · 48ms",
  },
  {
    slug: "depth",
    title: "Depth Estimation",
    image: "/assets/visual-depth-estimation.png",
    meta: "16-bit metric map · 640×640 · 65ms",
  },
  {
    slug: "tracking",
    title: "Video Object Tracking",
    image: "/assets/visual-video-object-tracking.png",
    meta: "Video clip · BoT-SORT · 300 frames",
    isVideo: true,
  },
];

export default function GalleryIndexPage() {
  return (
    <div className="min-h-screen bg-[#0A0C10] text-[#E8EAED] flex flex-col justify-between">
      {/* Navigation */}
      <header className="h-16 border-b border-[#252B37] px-6 flex items-center justify-between">
        <a
          href="/"
          className="flex items-center gap-2 text-sm text-[#9AA3B2] hover:text-[#E8EAED] transition-colors"
        >
          <ArrowLeftIcon size={16} />
          <span>Home</span>
        </a>
        <div className="flex items-center gap-2 font-semibold text-sm">
          <SparklesIcon size={16} className="text-[#22D3EE]" />
          <span>Demo Gallery</span>
        </div>
        <a href="/signup">
          <Button size="sm" variant="primary">
            Create account
          </Button>
        </a>
      </header>

      {/* Gallery content */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#E8EAED]">
            See it working
          </h1>
          <p className="text-sm text-[#9AA3B2] mt-1">
            Real analysis results from all seven computer vision tasks.
            Pre-computed so you can inspect immediately without signing up.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {GALLERY_ITEMS.map((item) => (
            <a
              key={item.slug}
              href={`/gallery/${item.slug}`}
              className="group block rounded-[8px] bg-[#12151C] border border-[#252B37] hover:border-[#22D3EE]/50 transition-all overflow-hidden"
            >
              <div className="h-48 bg-[#1A1F29] relative overflow-hidden">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {item.isVideo && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-[#0A0C10]/80 border border-[#252B37] text-[10px] font-mono text-[#22D3EE]">
                    VIDEO
                  </span>
                )}
              </div>
              <div className="p-4 space-y-1">
                <h3 className="text-sm font-semibold text-[#E8EAED] group-hover:text-[#22D3EE] transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs font-mono text-[#9AA3B2]">{item.meta}</p>
              </div>
            </a>
          ))}
        </div>
      </main>

      {/* Footer CTA */}
      <footer className="border-t border-[#252B37] py-8 px-6 text-center space-y-4">
        <p className="text-sm text-[#9AA3B2]">
          Ready to run analysis on your own images and clips?
        </p>
        <a href="/signup">
          <Button variant="primary" rightIcon={<ArrowRightIcon size={16} />}>
            Create your account
          </Button>
        </a>
      </footer>
    </div>
  );
}
