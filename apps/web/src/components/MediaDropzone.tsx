/**
 * SightForge Media Dropzone & Preview (P4 U5, R16, R17, R21, R54)
 *
 * Provides drag-and-drop file ingestion, client-side pre-validation,
 * live preview with metadata, progress bar overlay, and replace affordance.
 */

"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  Card,
  UploadCloudIcon,
  FileVideoIcon,
  FileImageIcon,
  AlertCircleIcon,
} from "@sightforge/ui";
import {
  validateAndProbeMedia,
  type MediaProbeMetadata,
  type MediaValidationError,
} from "../lib/media-validation";
import type { UploadProgress } from "../lib/upload-manager";

export interface MediaDropzoneProps {
  onMediaSelected: (file: File, metadata: MediaProbeMetadata) => void;
  onMediaCleared: () => void;
  uploadProgress?: UploadProgress | null;
  disabled?: boolean;
}

export const MediaDropzone: React.FC<MediaDropzoneProps> = ({
  onMediaSelected,
  onMediaCleared,
  uploadProgress,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<MediaProbeMetadata | null>(null);
  const [validationError, setValidationError] =
    useState<MediaValidationError | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setValidationError(null);
      setIsValidating(true);

      const result = await validateAndProbeMedia(file);
      setIsValidating(false);

      if (!result.valid) {
        setValidationError(result);
        setSelectedFile(null);
        setMetadata(null);
        onMediaCleared();
        return;
      }

      setSelectedFile(file);
      setMetadata(result);
      onMediaSelected(file, result);
    },
    [onMediaSelected, onMediaCleared],
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file) {
        void processFile(file);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file) {
        void processFile(file);
      }
    }
  };

  const handleReplace = () => {
    if (disabled) return;
    if (metadata?.previewUrl && metadata.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(metadata.previewUrl);
    }
    setSelectedFile(null);
    setMetadata(null);
    setValidationError(null);
    onMediaCleared();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // State: File Selected & Previewing (or Uploading)
  if (selectedFile && metadata) {
    const isUploading = !!uploadProgress && uploadProgress.percentage < 100;
    const isComplete = !!uploadProgress && uploadProgress.percentage >= 100;

    return (
      <Card className="relative overflow-hidden p-0 border-[#252B37] bg-[#12151C]">
        {/* Preview Container */}
        <div className="relative h-[340px] w-full bg-[#0A0C10] flex items-center justify-center overflow-hidden">
          {metadata.mediaType === "video" ? (
            <div className="relative w-full h-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={metadata.previewUrl}
                alt="Video preview thumbnail"
                className="max-h-full max-w-full object-contain"
              />
              <div className="absolute top-3 left-3 bg-[#0A0C10]/80 backdrop-blur-sm border border-[#252B37] px-2 py-1 rounded-[4px] flex items-center gap-1.5 text-[11px] font-mono text-[#22D3EE]">
                <FileVideoIcon size={12} />
                <span>Video · {metadata.durationSeconds?.toFixed(1)}s</span>
              </div>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={metadata.previewUrl}
              alt="Uploaded media preview"
              className="max-h-full max-w-full object-contain"
            />
          )}

          {/* Replace Button */}
          {!isUploading && !isComplete && (
            <button
              type="button"
              onClick={handleReplace}
              className="absolute top-3 right-3 bg-[#1A1F29]/90 hover:bg-[#252B37] border border-[#252B37] hover:border-[#22D3EE]/50 text-xs font-medium text-[#E8EAED] px-3 py-1.5 rounded-[6px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#22D3EE]"
            >
              Replace
            </button>
          )}

          {/* Upload Progress Overlay */}
          {uploadProgress && (
            <div className="absolute inset-0 bg-[#0A0C10]/70 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
              <div className="w-full max-w-xs space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#9AA3B2]">
                    {uploadProgress.stage === "allocating"
                      ? "Allocating storage grant…"
                      : uploadProgress.percentage >= 100
                        ? "Upload complete"
                        : "Uploading directly to R2…"}
                  </span>
                  <span className="text-[#22D3EE] font-semibold">
                    {uploadProgress.percentage}%
                  </span>
                </div>
                <div className="w-full h-2 bg-[#1A1F29] rounded-full overflow-hidden border border-[#252B37]">
                  <div
                    className="h-full bg-[#22D3EE] transition-all duration-150 ease-out"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  />
                </div>
                <div className="text-[11px] font-mono text-[#6B7280]">
                  {formatFileSize(uploadProgress.loadedBytes)} /{" "}
                  {formatFileSize(uploadProgress.totalBytes)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Monospace Metadata Footer */}
        <div className="px-5 py-3 border-t border-[#252B37] bg-[#1A1F29]/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#9AA3B2]">
          <div className="flex items-center gap-2 truncate max-w-[260px]">
            {metadata.mediaType === "video" ? (
              <FileVideoIcon size={14} className="text-[#22D3EE] shrink-0" />
            ) : (
              <FileImageIcon size={14} className="text-[#22D3EE] shrink-0" />
            )}
            <span className="truncate text-[#E8EAED]" title={metadata.filename}>
              {metadata.filename}
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>
              {metadata.width}×{metadata.height}
            </span>
            <span>{formatFileSize(metadata.sizeBytes)}</span>
            {metadata.durationSeconds !== undefined && (
              <span className="text-[#22D3EE]">
                {metadata.durationSeconds.toFixed(1)}s
              </span>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // State: Empty Dropzone
  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4"
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
        aria-label="Upload media file"
      />

      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`h-[380px] rounded-[8px] border-2 border-dashed flex flex-col items-center justify-center text-center p-8 cursor-pointer transition-all duration-200 outline-none focus:ring-2 focus:ring-[#22D3EE] focus:ring-offset-2 focus:ring-offset-[#0A0C10] ${
          isDragOver
            ? "border-[#22D3EE] bg-[#22D3EE]/5 scale-[1.005]"
            : "border-[#252B37] bg-[#12151C] hover:border-[#22D3EE]/50 hover:bg-[#1A1F29]/50"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <div className="w-14 h-14 rounded-full bg-[#1A1F29] border border-[#252B37] flex items-center justify-center mb-4 text-[#22D3EE] group-hover:scale-105 transition-transform">
          <UploadCloudIcon size={28} />
        </div>

        <h3 className="text-base font-semibold text-[#E8EAED] mb-1">
          {isValidating ? "Inspecting media…" : "Drop an image or video here"}
        </h3>
        <p className="text-xs text-[#9AA3B2] mb-6">
          or click to browse from your computer
        </p>

        <div className="max-w-xs space-y-1.5 pt-4 border-t border-[#252B37]/60 text-[11px] font-mono text-[#6B7280]">
          <div className="flex items-center justify-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22D3EE]" />
            <span>Images: JPEG, PNG, WebP up to 10 MB</span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
            <span>Video: MP4 (H.264) up to 50 MB &amp; 30s</span>
          </div>
        </div>
      </div>

      {/* Validation Error Banner */}
      {validationError && (
        <div
          role="alert"
          className="p-3 bg-[#F87171]/10 border border-[#F87171]/30 rounded-[8px] flex items-start gap-2.5 text-xs text-[#F87171] animate-in fade-in"
        >
          <AlertCircleIcon size={16} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">
              Validation Failed
            </span>
            <span>{validationError.errorMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
};
