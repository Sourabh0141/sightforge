"use client";

/**
 * SightForge UI - Classification Viewer Component (R55, R63, R73, KTD3)
 * Non-canvas ranked prediction list and certainty meter display.
 */

import React from "react";
import type { ClassificationPrediction } from "@sightforge/contracts";
import { Card } from "../components/Card";
import { sanitizeText } from "./palette";

export interface ClassificationViewerProps {
  predictions: ClassificationPrediction[];
  frameIndex?: number;
  timestampMs?: number;
  className?: string;
}

export function ClassificationViewer({
  predictions,
  frameIndex = 0,
  timestampMs = 0,
  className = "",
}: ClassificationViewerProps) {
  const sorted = [...predictions].sort((a, b) => a.rank - b.rank);
  const top1 = sorted[0];

  return (
    <div
      role="region"
      aria-label="Image classification results"
      className={`space-y-6 ${className}`}
    >
      {/* Top-1 Hero Card */}
      {top1 && (
        <Card className="p-6 bg-[#12151C] border border-[#252B37] rounded-[8px] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#22D3EE]/10 text-[#22D3EE] border border-[#22D3EE]/30">
                RANK #1 · TOP PREDICTION
              </span>
              <span className="text-xs font-mono text-[#9AA3B2]">
                Class ID: {top1.class_id}
              </span>
            </div>
            <div className="text-xs font-mono text-[#9AA3B2]">
              {(top1.confidence * 100).toFixed(1)}% Certainty
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-2xl font-bold tracking-tight text-[#E8EAED] capitalize font-mono">
              {sanitizeText(top1.class_name)}
            </div>

            {/* Gradient Confidence Bar */}
            <div className="h-2.5 w-full bg-[#0A0C10] border border-[#252B37] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(0, top1.confidence * 100))}%`,
                  background:
                    "linear-gradient(90deg, #22D3EE 0%, #A78BFA 100%)",
                }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Ranked Predictions Table */}
      <div className="bg-[#12151C] border border-[#252B37] rounded-[8px] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#252B37] flex items-center justify-between bg-[#1A1F29]/50">
          <h3 className="text-xs font-mono uppercase tracking-wider text-[#9AA3B2]">
            Ranked Probabilities (Top-{sorted.length})
          </h3>
          {timestampMs > 0 && (
            <span className="text-[11px] font-mono text-[#6B7280]">
              Frame {frameIndex} · {(timestampMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>

        <div className="divide-y divide-[#252B37] overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="text-[11px] uppercase text-[#9AA3B2] bg-[#0A0C10]/40">
              <tr>
                <th className="py-2.5 px-4 font-medium w-16">Rank</th>
                <th className="py-2.5 px-4 font-medium">Class Name</th>
                <th className="py-2.5 px-4 font-medium w-24">Class ID</th>
                <th className="py-2.5 px-4 font-medium w-48">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#252B37]">
              {sorted.map((pred) => {
                const pct = (pred.confidence * 100).toFixed(1);
                const isTop1 = pred.rank === 1;

                return (
                  <tr
                    key={`${pred.class_id}-${pred.rank}`}
                    className={`hover:bg-[#1A1F29]/60 transition-colors ${
                      isTop1 ? "bg-[#22D3EE]/5" : ""
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold text-[#9AA3B2]">
                      #{pred.rank}
                    </td>
                    <td className="py-3 px-4 text-[#E8EAED] font-medium capitalize">
                      {sanitizeText(pred.class_name)}
                    </td>
                    <td className="py-3 px-4 text-[#6B7280]">
                      {pred.class_id}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <span className="w-12 text-right text-[#E8EAED] font-semibold">
                          {pct}%
                        </span>
                        <div className="flex-1 h-1.5 bg-[#0A0C10] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, pred.confidence * 100))}%`,
                              background: isTop1
                                ? "linear-gradient(90deg, #22D3EE 0%, #A78BFA 100%)"
                                : "#22D3EE",
                              opacity: isTop1 ? 1 : 0.7,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
