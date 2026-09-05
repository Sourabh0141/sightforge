"use client";

import React, { useCallback } from "react";
import { ViewerShell } from "@sightforge/ui";
import type { GalleryTaskMetadata } from "@/lib/gallery-fixtures";

export interface GalleryTaskClientProps {
  taskMeta: GalleryTaskMetadata;
}

export function GalleryTaskClient({ taskMeta }: GalleryTaskClientProps) {
  const resolveArtifact = useCallback(
    () => taskMeta.artifactDataUrl || "",
    [taskMeta.artifactDataUrl],
  );

  return (
    <ViewerShell
      document={taskMeta.document}
      mediaUrl={taskMeta.mediaUrl}
      resolveArtifact={resolveArtifact}
      readOnly
    />
  );
}
