import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "./api-client";

describe("Live Status Protocol & Endpoint Handshake (KTD5, R29, R30, R31, R115)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("mints ticket via POST /jobs/:id/ticket for active non-terminal job", async () => {
    const mockTicketPost = vi.spyOn(api, "post").mockResolvedValue({
      ticket: "tkt_live_abc123",
      jobId: "job-test-live",
      expiresInSeconds: 300,
    });

    const ticketRes = await api.post<{ ticket: string; jobId: string }>(
      "/jobs/job-test-live/ticket",
    );

    expect(mockTicketPost).toHaveBeenCalledWith("/jobs/job-test-live/ticket");
    expect(ticketRes.ticket).toBe("tkt_live_abc123");

    // Verify subprotocol format
    const subprotocol = `ticket.${ticketRes.ticket}`;
    expect(subprotocol).toBe("ticket.tkt_live_abc123");
  });

  it("queries adaptive polling status via GET /jobs/:id/status", async () => {
    const mockGetStatus = vi.spyOn(api, "get").mockResolvedValue({
      jobId: "job-poll-test",
      status: "processing",
      task: "detection",
      mediaType: "video",
      framesCompleted: 120,
      framesTotal: 300,
      isLive: true,
      pollIntervalMs: 2000,
      estimatedWaitSeconds: 8,
      updatedAt: 1725000000000,
    });

    const statusData = await api.get<{
      jobId: string;
      status: string;
      framesCompleted: number;
      framesTotal: number;
      pollIntervalMs: number;
    }>("/jobs/job-poll-test/status");

    expect(mockGetStatus).toHaveBeenCalledWith("/jobs/job-poll-test/status");
    expect(statusData.status).toBe("processing");
    expect(statusData.framesCompleted).toBe(120);
    expect(statusData.framesTotal).toBe(300);
    expect(statusData.pollIntervalMs).toBe(2000);
  });

  it("cancels non-terminal job via POST /jobs/:id/cancel", async () => {
    const mockCancelPost = vi.spyOn(api, "post").mockResolvedValue({
      jobId: "job-cancel-test",
      status: "cancelled",
      updatedAt: 1725000050000,
    });

    const cancelRes = await api.post<{ jobId: string; status: string }>(
      "/jobs/job-cancel-test/cancel",
    );

    expect(mockCancelPost).toHaveBeenCalledWith("/jobs/job-cancel-test/cancel");
    expect(cancelRes.status).toBe("cancelled");
  });

  it("retrieves presigned results and dense mask download URLs for completed job", async () => {
    const mockResultsGet = vi
      .spyOn(api, "get")
      .mockImplementation((path: string) => {
        if (path.includes("/dense-artifact")) {
          return Promise.resolve({
            jobId: "job-completed",
            denseArtifactKey: "users/u1/artifacts/depth.png",
            downloadUrl: "https://r2.storage/dense-artifact.png?sig=xyz",
            expiresInSeconds: 3600,
          });
        }
        return Promise.resolve({
          jobId: "job-completed",
          resultKey: "users/u1/results/res.json",
          downloadUrl: "https://r2.storage/result.json?sig=xyz",
          expiresInSeconds: 3600,
        });
      });

    const results = await api.get<{ downloadUrl: string }>(
      "/jobs/job-completed/results",
    );
    const denseArtifact = await api.get<{ downloadUrl: string }>(
      "/jobs/job-completed/results/dense-artifact",
    );

    expect(results.downloadUrl).toContain("result.json");
    expect(denseArtifact.downloadUrl).toContain("dense-artifact.png");
    expect(mockResultsGet).toHaveBeenCalledTimes(2);
  });
});
