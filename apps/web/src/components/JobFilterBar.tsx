/**
 * SightForge Job History Filter Bar (P4 U5, R54)
 *
 * Provides status chips, task dropdown, and search filter with zero reload lag.
 */

"use client";

import React from "react";
import { SearchIcon, FilterXIcon } from "@sightforge/ui";
import type { TaskType } from "../lib/types";

export type StatusFilterType =
  "all" | "running" | "completed" | "failed" | "cancelled";

export interface JobFilterState {
  status: StatusFilterType;
  task: TaskType | "all";
  search: string;
}

export interface JobFilterBarProps {
  filters: JobFilterState;
  onChange: (filters: JobFilterState) => void;
  totalCount: number;
  filteredCount: number;
}

export const JobFilterBar: React.FC<JobFilterBarProps> = ({
  filters,
  onChange,
  totalCount,
  filteredCount,
}) => {
  const statusChips: { id: StatusFilterType; label: string }[] = [
    { id: "all", label: "All" },
    { id: "running", label: "Running" },
    { id: "completed", label: "Completed" },
    { id: "failed", label: "Failed" },
    { id: "cancelled", label: "Cancelled" },
  ];

  const taskOptions: { id: TaskType | "all"; label: string }[] = [
    { id: "all", label: "All Tasks" },
    { id: "detection", label: "Object Detection" },
    { id: "instance_segmentation", label: "Instance Segmentation" },
    { id: "semantic_segmentation", label: "Semantic Segmentation" },
    { id: "classification", label: "Classification" },
    { id: "pose", label: "Pose Estimation" },
    { id: "obb", label: "Oriented Bounding Box" },
    { id: "depth", label: "Depth Estimation" },
  ];

  const handleStatusClick = (status: StatusFilterType) => {
    onChange({ ...filters, status });
  };

  const handleTaskChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...filters, task: e.target.value as TaskType | "all" });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, search: e.target.value });
  };

  const handleResetFilters = () => {
    onChange({ status: "all", task: "all", search: "" });
  };

  const hasActiveFilters =
    filters.status !== "all" || filters.task !== "all" || filters.search !== "";

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {statusChips.map((chip) => {
            const isActive = filters.status === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleStatusClick(chip.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors focus:outline-none focus:ring-2 focus:ring-[#22D3EE] ${
                  isActive
                    ? "bg-[#22D3EE]/15 border-[#22D3EE] text-[#22D3EE]"
                    : "bg-[#12151C] border-[#252B37] text-[#9AA3B2] hover:border-[#252B37]/80 hover:text-[#E8EAED]"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Task Select & Search Input */}
        <div className="flex items-center gap-2">
          {/* Task Dropdown */}
          <select
            value={filters.task}
            onChange={handleTaskChange}
            aria-label="Filter by task"
            className="bg-[#12151C] border border-[#252B37] text-[#E8EAED] text-xs rounded-[6px] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#22D3EE]"
          >
            {taskOptions.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-[#12151C]">
                {opt.label}
              </option>
            ))}
          </select>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-48">
            <SearchIcon
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B7280]"
            />
            <input
              type="text"
              placeholder="Search filename or ID…"
              value={filters.search}
              onChange={handleSearchChange}
              className="w-full bg-[#12151C] border border-[#252B37] text-[#E8EAED] text-xs rounded-[6px] pl-7 pr-3 py-1.5 placeholder-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]"
            />
          </div>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              title="Reset filters"
              className="p-1.5 text-[#9AA3B2] hover:text-[#E8EAED] hover:bg-[#1A1F29] rounded-[6px] transition-colors"
            >
              <FilterXIcon size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Filter summary */}
      {hasActiveFilters && (
        <div className="text-[11px] font-mono text-[#6B7280] flex items-center justify-between">
          <span>
            Showing {filteredCount} of {totalCount} jobs
          </span>
        </div>
      )}
    </div>
  );
};
