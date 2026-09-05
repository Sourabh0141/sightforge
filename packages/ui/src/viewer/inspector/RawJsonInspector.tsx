"use client";

/**
 * SightForge UI - High-Performance Raw JSON Inspector (R57, R61, R73)
 *
 * Provides:
 * - Structural tree navigation over arbitrary SightForge result documents.
 * - Deep search / filter across keys and values.
 * - Key path copy and full document clipboard export.
 * - Syntax highlighting matching SightForge design tokens.
 * - Non-blocking virtualized / collapsible rendering preventing UI tab freeze.
 */

import React, { useState, useMemo, useCallback } from "react";
import type { SightForgeResultDocument } from "@sightforge/contracts";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { CheckIcon, CopyIcon, SearchIcon } from "../../components/icons";

export interface RawJsonInspectorProps {
  document: SightForgeResultDocument;
  className?: string;
  initialExpandedDepth?: number;
}

interface JsonNodeProps {
  name: string;
  value: any;
  path: string;
  depth: number;
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  copyPath: (path: string) => void;
  copiedPath: string | null;
  searchQuery: string;
}

function matchesSearch(key: string, val: any, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (key.toLowerCase().includes(q)) return true;
  if (val === null || val === undefined) return false;
  if (
    typeof val === "string" ||
    typeof val === "number" ||
    typeof val === "boolean"
  ) {
    return String(val).toLowerCase().includes(q);
  }
  if (typeof val === "object") {
    return JSON.stringify(val).toLowerCase().includes(q);
  }
  return false;
}

function JsonNode({
  name,
  value,
  path,
  depth,
  expandedPaths,
  togglePath,
  copyPath,
  copiedPath,
  searchQuery,
}: JsonNodeProps) {
  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const isExpanded = expandedPaths.has(path);
  const isPathCopied = copiedPath === path;

  const isMatch = useMemo(
    () => matchesSearch(name, value, searchQuery),
    [name, value, searchQuery],
  );

  if (searchQuery && !isMatch) {
    return null;
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePath(path);
  };

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyPath(path);
  };

  const renderPrimitive = () => {
    if (value === null) {
      return <span className="text-[#64748B] italic">null</span>;
    }
    if (typeof value === "boolean") {
      return (
        <span className="text-[#FBBF24] font-bold">
          {value ? "true" : "false"}
        </span>
      );
    }
    if (typeof value === "number") {
      return <span className="text-[#A78BFA]">{value}</span>;
    }
    if (typeof value === "string") {
      return (
        <span className="text-[#34D399]">
          &quot;{value.length > 80 ? `${value.substring(0, 80)}…` : value}&quot;
        </span>
      );
    }
    return <span className="text-[#E8EAED]">{String(value)}</span>;
  };

  if (!isObject) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 hover:bg-[#1A1F29]/60 px-1 rounded font-mono text-xs group">
        <span className="text-[#9AA3B2] select-none">{name}:</span>
        {renderPrimitive()}
        <button
          type="button"
          onClick={handleCopyPath}
          title={`Copy path: ${path}`}
          className="opacity-0 group-hover:opacity-100 text-[#64748B] hover:text-[#22D3EE] transition-opacity ml-2 text-[10px]"
        >
          {isPathCopied ? (
            <span className="text-[#34D399] font-sans">copied!</span>
          ) : (
            <CopyIcon className="w-3 h-3" />
          )}
        </button>
      </div>
    );
  }

  const entries: Array<[string, any]> = isArray
    ? value.map((v: any, idx: number): [string, any] => [String(idx), v])
    : Object.entries(value);

  const count = entries.length;
  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  return (
    <div className="font-mono text-xs">
      <div
        onClick={handleToggle}
        className="flex items-center gap-1.5 py-0.5 hover:bg-[#1A1F29] px-1 rounded cursor-pointer group select-none"
      >
        <span className="text-[#64748B] w-3 text-center text-[10px]">
          {isExpanded ? "▼" : "▶"}
        </span>
        <span className="text-[#22D3EE] font-semibold">{name}:</span>
        <span className="text-[#9AA3B2]">
          {bracketOpen}
          {!isExpanded && (
            <span className="text-[#64748B] text-[10px] mx-1">
              {count} {count === 1 ? "item" : "items"}
            </span>
          )}
          {!isExpanded && bracketClose}
        </span>
        <button
          type="button"
          onClick={handleCopyPath}
          title={`Copy path: ${path}`}
          className="opacity-0 group-hover:opacity-100 text-[#64748B] hover:text-[#22D3EE] transition-opacity ml-2 text-[10px]"
        >
          {isPathCopied ? (
            <span className="text-[#34D399] font-sans">copied!</span>
          ) : (
            <CopyIcon className="w-3 h-3" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="pl-4 border-l border-[#252B37]/60 ml-2 my-0.5 space-y-0.5">
          {entries.map(([childKey, childVal]: [string, any]) => {
            const childPath = isArray
              ? `${path}[${childKey}]`
              : path
                ? `${path}.${childKey}`
                : childKey;
            return (
              <JsonNode
                key={childPath}
                name={childKey}
                value={childVal}
                path={childPath}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                togglePath={togglePath}
                copyPath={copyPath}
                copiedPath={copiedPath}
                searchQuery={searchQuery}
              />
            );
          })}
          <div className="text-[#9AA3B2] pl-1">{bracketClose}</div>
        </div>
      )}
    </div>
  );
}

export function RawJsonInspector({
  document,
  className = "",
  initialExpandedDepth = 2,
}: RawJsonInspectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedDoc, setCopiedDoc] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const initialPaths = useMemo(() => {
    const set = new Set<string>();
    const traverse = (obj: any, path: string, depth: number) => {
      if (
        depth <= initialExpandedDepth &&
        obj !== null &&
        typeof obj === "object"
      ) {
        set.add(path);
        if (Array.isArray(obj)) {
          obj.forEach((item, idx) =>
            traverse(item, `${path}[${idx}]`, depth + 1),
          );
        } else {
          Object.entries(obj).forEach(([k, v]) =>
            traverse(v, path ? `${path}.${k}` : k, depth + 1),
          );
        }
      }
    };
    traverse(document, "root", 0);
    return set;
  }, [document, initialExpandedDepth]);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(initialPaths);

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const set = new Set<string>();
    const traverse = (obj: any, path: string) => {
      if (obj !== null && typeof obj === "object") {
        set.add(path);
        if (Array.isArray(obj)) {
          obj.forEach((item, idx) => traverse(item, `${path}[${idx}]`));
        } else {
          Object.entries(obj).forEach(([k, v]) =>
            traverse(v, path ? `${path}.${k}` : k),
          );
        }
      }
    };
    traverse(document, "root");
    setExpandedPaths(set);
  }, [document]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set(["root"]));
  }, []);

  const handleCopyDoc = useCallback(() => {
    try {
      navigator.clipboard.writeText(JSON.stringify(document, null, 2));
      setCopiedDoc(true);
      setTimeout(() => setCopiedDoc(false), 2000);
    } catch (err) {
      console.warn("Failed to copy document:", err);
    }
  }, [document]);

  const handleCopyPath = useCallback((path: string) => {
    try {
      const cleanPath = path.replace(/^root\./, "").replace(/^root/, "");
      navigator.clipboard.writeText(cleanPath || ".");
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1500);
    } catch (err) {
      console.warn("Failed to copy path:", err);
    }
  }, []);

  return (
    <Card
      className={`p-4 bg-[#12151C] border border-[#252B37] rounded-[8px] flex flex-col space-y-3 ${className}`}
    >
      {/* Inspector Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#252B37]">
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            placeholder="Filter keys or values..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[#0A0C10] border border-[#252B37] rounded-[6px] text-xs text-[#E8EAED] placeholder-[#64748B] focus:outline-none focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={expandAll}
            className="text-xs h-7 px-2.5"
          >
            Expand All
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={collapseAll}
            className="text-xs h-7 px-2.5"
          >
            Collapse All
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyDoc}
            className="text-xs h-7 px-2.5 gap-1.5"
          >
            {copiedDoc ? (
              <>
                <CheckIcon className="w-3.5 h-3.5 text-[#34D399]" />
                <span className="text-[#34D399]">Copied JSON</span>
              </>
            ) : (
              <>
                <CopyIcon className="w-3.5 h-3.5" />
                <span>Copy JSON</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* JSON Tree Viewport */}
      <div className="bg-[#0A0C10] border border-[#252B37] rounded-[6px] p-4 overflow-x-auto max-h-[600px] overflow-y-auto font-mono text-xs">
        <JsonNode
          name="result"
          value={document}
          path="root"
          depth={0}
          expandedPaths={expandedPaths}
          togglePath={togglePath}
          copyPath={handleCopyPath}
          copiedPath={copiedPath}
          searchQuery={searchQuery}
        />
      </div>

      {/* Footer Schema Info */}
      <div className="flex items-center justify-between text-[11px] text-[#64748B] font-mono pt-1">
        <span>Task: {document.task}</span>
        <span>Schema Version: {document.schema_version}</span>
      </div>
    </Card>
  );
}
