import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadMediaJob, type UploadProgress } from "./upload-manager";
import { api } from "./api-client";

describe("Direct R2 Upload Manager (R18, R19, R54)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("successfully creates job via api.post and uploads to presigned URL", async () => {
    const mockPost = vi.spyOn(api, "post").mockResolvedValue({
      jobId: "job-12345",
      status: "created",
      task: "detection",
      mode: "per_frame",
      mediaType: "image",
      modelVariant: "nano",
      confidenceThreshold: 0.25,
      uploadUrl: "https://r2.storage/upload?sig=abc",
      uploadContentType: "image/png",
      mediaKey: "users/u1/media/job-12345.png",
      createdAt: new Date().toISOString(),
    });

    const progressUpdates: UploadProgress[] = [];

    // Mock XMLHttpRequest
    class MockXHR {
      upload = {
        onprogress: null as ((ev: any) => void) | null,
      };
      status = 200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;

      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => {
        // Trigger simulated progress
        if (this.upload.onprogress) {
          this.upload.onprogress({
            lengthComputable: true,
            loaded: 500,
            total: 1000,
          });
          this.upload.onprogress({
            lengthComputable: true,
            loaded: 1000,
            total: 1000,
          });
        }
        if (this.onload) {
          this.status = 200;
          this.onload();
        }
      });
      abort = vi.fn();
    }

    vi.stubGlobal("XMLHttpRequest", MockXHR);

    const testFile = new File(["test data buffer"], "test.png", {
      type: "image/png",
    });

    const handle = uploadMediaJob(
      testFile,
      {
        task: "detection",
        modelVariant: "nano",
        mode: "per_frame",
        mediaType: "image",
        originalFilename: "test.png",
        confidenceThreshold: 0.25,
      },
      (p) => progressUpdates.push(p),
    );

    const result = await handle.promise;

    expect(mockPost).toHaveBeenCalledWith(
      "/jobs",
      expect.objectContaining({
        task: "detection",
        modelVariant: "nano",
        mode: "per-frame",
        mediaType: "image",
        originalFilename: "test.png",
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": expect.any(String),
        }),
      }),
    );

    expect(result.jobId).toBe("job-12345");
    expect(progressUpdates.length).toBeGreaterThan(0);
    const lastProgress = progressUpdates[progressUpdates.length - 1];
    expect(lastProgress?.percentage).toBe(100);
  });

  it("handles storage upload failure when XHR status >= 400", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      jobId: "job-fail",
      status: "created",
      task: "detection",
      mode: "per_frame",
      mediaType: "image",
      modelVariant: "nano",
      confidenceThreshold: 0.25,
      uploadUrl: "https://r2.storage/upload-fail",
      uploadContentType: "image/png",
      mediaKey: "users/u1/media/job-fail.png",
      createdAt: new Date().toISOString(),
    });

    class MockFailingXHR {
      upload = { onprogress: null };
      status = 403;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => {
        if (this.onload) {
          this.status = 403;
          this.onload();
        }
      });
      abort = vi.fn();
    }

    vi.stubGlobal("XMLHttpRequest", MockFailingXHR);

    const testFile = new File(["test data"], "fail.png", {
      type: "image/png",
    });

    const handle = uploadMediaJob(testFile, {
      task: "detection",
      mediaType: "image",
      originalFilename: "fail.png",
    });

    await expect(handle.promise).rejects.toThrow(
      "Direct storage upload failed with HTTP status 403",
    );
  });

  it("aborts in-flight upload when handle.abort() is triggered", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      jobId: "job-abort",
      status: "created",
      task: "detection",
      mode: "per_frame",
      mediaType: "image",
      modelVariant: "nano",
      confidenceThreshold: 0.25,
      uploadUrl: "https://r2.storage/upload-abort",
      uploadContentType: "image/png",
      mediaKey: "users/u1/media/job-abort.png",
      createdAt: new Date().toISOString(),
    });

    class MockAbortXHR {
      upload = { onprogress: null };
      status = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn();
      abort = vi.fn(() => {
        if (this.onabort) this.onabort();
      });
    }

    vi.stubGlobal("XMLHttpRequest", MockAbortXHR);

    const testFile = new File(["test data"], "abort.png", {
      type: "image/png",
    });

    const handle = uploadMediaJob(testFile, {
      task: "detection",
      mediaType: "image",
      originalFilename: "abort.png",
    });

    // Wait microtask for api.post to complete
    await new Promise((r) => setTimeout(r, 10));
    handle.abort();

    await expect(handle.promise).rejects.toThrow("Upload aborted");
  });
});
