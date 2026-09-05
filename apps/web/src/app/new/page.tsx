/**
 * SightForge New Job Analysis Page (P4 U5, R54, R60, R16-R24)
 *
 * Hosts the media drag-and-drop dropzone, dynamic task configuration panel,
 * client pre-validation, direct R2 upload execution, and redirection to live tracker.
 */

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, ErrorBanner } from "@sightforge/ui";
import { MediaDropzone } from "../../components/MediaDropzone";
import {
  TaskConfigPanel,
  type TaskConfigValues,
} from "../../components/TaskConfigPanel";
import {
  uploadMediaJob,
  type UploadProgress,
  type UploadHandle,
} from "../../lib/upload-manager";
import type { MediaProbeMetadata } from "../../lib/media-validation";

export default function NewJobPage() {
  const router = useRouter();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaMetadata, setMediaMetadata] = useState<MediaProbeMetadata | null>(
    null,
  );
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeUploadHandle, setActiveUploadHandle] =
    useState<UploadHandle | null>(null);

  const [configValues, setConfigValues] = useState<TaskConfigValues>({
    task: "detection",
    modelVariant: "nano",
    mode: "per_frame",
    confidenceThreshold: 0.25,
    sampledFps: 5,
  });

  const isVideo = mediaMetadata?.mediaType === "video";

  const handleMediaSelected = (file: File, meta: MediaProbeMetadata) => {
    setSelectedFile(file);
    setMediaMetadata(meta);
    setErrorMessage(null);

    // Default mode adjustment for video vs image
    if (meta.mediaType === "video") {
      setConfigValues((prev) => ({
        ...prev,
        mode: prev.mode || "per_frame",
      }));
    } else {
      setConfigValues((prev) => ({
        ...prev,
        mode: "per_frame",
      }));
    }
  };

  const handleMediaCleared = () => {
    setSelectedFile(null);
    setMediaMetadata(null);
    setUploadProgress(null);
    setErrorMessage(null);
    if (activeUploadHandle) {
      activeUploadHandle.abort();
      setActiveUploadHandle(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile || !mediaMetadata || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const handle = uploadMediaJob(
        selectedFile,
        {
          task: configValues.task,
          modelVariant: configValues.modelVariant,
          mode: isVideo ? configValues.mode : "per_frame",
          mediaType: mediaMetadata.mediaType,
          originalFilename: selectedFile.name,
          confidenceThreshold: configValues.confidenceThreshold,
          sampledFps: isVideo ? configValues.sampledFps : undefined,
        },
        (progress) => {
          setUploadProgress(progress);
        },
      );

      setActiveUploadHandle(handle);
      const createdJob = await handle.promise;

      // Navigate to live status page upon successful upload and registration
      router.push(`/jobs?id=${createdJob.jobId}`);
    } catch (err) {
      setIsSubmitting(false);
      setUploadProgress(null);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to upload media and initiate inference job.",
      );
    }
  };

  return (
    <AppShell
      currentPath="/new"
      topBarProps={{
        title: "New Job",
        subtitle: "Configure media and computer vision analysis",
      }}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {errorMessage && (
          <ErrorBanner
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Media Dropzone & Preview (60% width on desktop) */}
          <div className="lg:col-span-7 space-y-4">
            <MediaDropzone
              onMediaSelected={handleMediaSelected}
              onMediaCleared={handleMediaCleared}
              uploadProgress={uploadProgress}
              disabled={isSubmitting}
            />
          </div>

          {/* Right Column: Task Configuration Panel (40% width on desktop) */}
          <div className="lg:col-span-5 space-y-6">
            <TaskConfigPanel
              values={configValues}
              onChange={setConfigValues}
              isVideo={isVideo}
              canSubmit={!!selectedFile && !!mediaMetadata}
              isSubmitting={isSubmitting}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
