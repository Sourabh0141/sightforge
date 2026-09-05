/**
 * SightForge Transport-Agnostic Live Status Hook (P4 U5, KTD5, R29, R30, R31, R32, R115)
 *
 * Provides live job status and frame progress over WebSocket via single-use ticket
 * authentication with seamless automatic fallback to adaptive HTTP polling.
 */

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "./api-client";
import type { JobStatusType } from "@sightforge/ui";

export interface LiveJobStatusData {
  jobId: string;
  status: JobStatusType;
  task?: string;
  mode?: string;
  mediaType?: string;
  modelVariant?: string;
  framesCompleted?: number;
  framesTotal?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  inferenceDurationMs?: number | null;
  coldStartDurationMs?: number | null;
  updatedAt: number;
  isLive: boolean;
  possiblyStale?: boolean;
  estimatedWaitSeconds?: number;
  pollIntervalMs?: number;
}

export interface UseJobStatusResult {
  data: LiveJobStatusData | null;
  isLoading: boolean;
  error: Error | null;
  transport: "websocket" | "polling" | "terminal" | "none";
  isReconnecting: boolean;
  cancelJob: () => Promise<void>;
  refetch: () => Promise<void>;
}

interface TicketResponse {
  ticket: string;
  jobId: string;
  expiresInSeconds: number;
}

const TERMINAL_STATES = new Set<JobStatusType>([
  "completed",
  "failed",
  "cancelled",
]);

export function useJobStatus(
  jobId: string | null | undefined,
  initialData?: Partial<LiveJobStatusData>,
): UseJobStatusResult {
  const [data, setData] = useState<LiveJobStatusData | null>(() => {
    if (!jobId) return null;
    if (initialData && initialData.status) {
      return {
        jobId,
        status: initialData.status,
        task: initialData.task,
        mode: initialData.mode,
        mediaType: initialData.mediaType,
        modelVariant: initialData.modelVariant,
        framesCompleted: initialData.framesCompleted ?? 0,
        framesTotal: initialData.framesTotal ?? null,
        errorCode: initialData.errorCode ?? null,
        errorMessage: initialData.errorMessage ?? null,
        durationMs: initialData.durationMs ?? null,
        inferenceDurationMs: initialData.inferenceDurationMs ?? null,
        coldStartDurationMs: initialData.coldStartDurationMs ?? null,
        updatedAt: initialData.updatedAt ?? Date.now(),
        isLive: true,
      };
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(!initialData?.status);
  const [error, setError] = useState<Error | null>(null);
  const [transport, setTransport] = useState<
    "websocket" | "polling" | "terminal" | "none"
  >("none");
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const consecutiveSocketFailuresRef = useRef<number>(0);
  const isUnmountedRef = useRef<boolean>(false);

  // Clear timers and active sockets
  const cleanupConnections = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  // Adaptive polling worker function (R30)
  const pollStatus = useCallback(async () => {
    if (!jobId || isUnmountedRef.current) return;

    try {
      const response = await api.get<LiveJobStatusData>(
        `/jobs/${jobId}/status`,
      );
      if (isUnmountedRef.current) return;

      setData(response);
      setIsLoading(false);
      setError(null);

      if (TERMINAL_STATES.has(response.status)) {
        setTransport("terminal");
        cleanupConnections();
        return;
      }

      setTransport("polling");

      // Adaptive interval: respect server advertised interval or default with backoff
      const interval = response.pollIntervalMs || 2000;
      if (document.visibilityState !== "hidden") {
        pollTimerRef.current = setTimeout(() => {
          void pollStatus();
        }, interval);
      }
    } catch (err) {
      if (isUnmountedRef.current) return;
      setError(err instanceof Error ? err : new Error("Failed to poll status"));
      setIsLoading(false);

      // Retry with 5s backoff on polling error
      pollTimerRef.current = setTimeout(() => {
        void pollStatus();
      }, 5000);
    }
  }, [jobId, cleanupConnections]);

  // WebSocket connect function with ticket subprotocol (R115, KTD5)
  const connectWebSocket = useCallback(async () => {
    if (!jobId || isUnmountedRef.current) return;

    // If socket failed too many times, fall back cleanly to polling
    if (consecutiveSocketFailuresRef.current >= 2) {
      void pollStatus();
      return;
    }

    try {
      setIsReconnecting(consecutiveSocketFailuresRef.current > 0);

      // Step 1: Mint single-use ticket via Edge API (R115)
      const ticketRes = await api.post<TicketResponse>(`/jobs/${jobId}/ticket`);
      if (isUnmountedRef.current) return;

      const ticket = ticketRes.ticket;
      const apiBase = (
        process.env.NEXT_PUBLIC_API_URL || window.location.origin
      ).replace(/\/$/, "");
      const wsUrl = `${apiBase.replace(/^http/, "ws")}/jobs/${jobId}/live`;

      // Step 2: Establish WebSocket with unpadded base64 ticket subprotocol (KTD5)
      const ws = new WebSocket(wsUrl, [`ticket.${ticket}`]);
      socketRef.current = ws;

      ws.onopen = () => {
        if (isUnmountedRef.current) {
          ws.close();
          return;
        }
        consecutiveSocketFailuresRef.current = 0;
        setTransport("websocket");
        setIsReconnecting(false);
        setError(null);
      };

      ws.onmessage = (event) => {
        if (isUnmountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "state" || msg.type === "progress") {
            setData((prev) => ({
              ...(prev || { jobId }),
              jobId: msg.jobId || jobId,
              status: msg.status || prev?.status || "queued",
              task: msg.task || prev?.task,
              mode: msg.mode || prev?.mode,
              mediaType: msg.mediaType || prev?.mediaType,
              modelVariant: msg.modelVariant || prev?.modelVariant,
              framesCompleted:
                msg.framesCompleted ?? prev?.framesCompleted ?? 0,
              framesTotal:
                msg.framesTotal !== undefined
                  ? msg.framesTotal
                  : prev?.framesTotal,
              errorCode: msg.errorCode ?? prev?.errorCode,
              errorMessage: msg.errorMessage ?? prev?.errorMessage,
              updatedAt: msg.updatedAt || Date.now(),
              isLive: true,
            }));
            setIsLoading(false);

            if (TERMINAL_STATES.has(msg.status)) {
              setTransport("terminal");
              cleanupConnections();
            }
          }
        } catch {
          // Ignore unparseable message
        }
      };

      ws.onerror = () => {
        if (isUnmountedRef.current) return;
        consecutiveSocketFailuresRef.current += 1;
        // Fall back to polling
        cleanupConnections();
        void pollStatus();
      };

      ws.onclose = (event) => {
        if (isUnmountedRef.current) return;
        if (event.code === 1000) {
          // Normal close
          return;
        }

        consecutiveSocketFailuresRef.current += 1;
        if (consecutiveSocketFailuresRef.current < 2) {
          // Attempt one reconnect with fresh ticket
          setTimeout(() => {
            void connectWebSocket();
          }, 1000);
        } else {
          // Fall back to polling
          cleanupConnections();
          void pollStatus();
        }
      };
    } catch {
      // Ticket minting failed (e.g. job is terminal or unauthorized)
      consecutiveSocketFailuresRef.current += 1;
      void pollStatus();
    }
  }, [jobId, cleanupConnections, pollStatus]);

  // Main lifecycle controller
  useEffect(() => {
    isUnmountedRef.current = false;
    consecutiveSocketFailuresRef.current = 0;

    if (!jobId) {
      setData(null);
      setIsLoading(false);
      setTransport("none");
      return;
    }

    // Initial fetch to determine immediate status
    const init = async () => {
      try {
        const initialStatus = await api.get<LiveJobStatusData>(
          `/jobs/${jobId}/status`,
        );
        if (isUnmountedRef.current) return;

        setData(initialStatus);
        setIsLoading(false);

        if (TERMINAL_STATES.has(initialStatus.status)) {
          setTransport("terminal");
          return;
        }

        // Attempt WebSocket connection for live non-terminal jobs
        void connectWebSocket();
      } catch {
        if (isUnmountedRef.current) return;
        // If initial status failed, start adaptive polling
        void pollStatus();
      }
    };

    void init();

    // Visibility change handler: pause polling when tab is hidden, resume on active
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (data && !TERMINAL_STATES.has(data.status)) {
          void pollStatus();
        }
      } else {
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isUnmountedRef.current = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cleanupConnections();
    };
  }, [jobId, connectWebSocket, pollStatus, cleanupConnections]);

  // Non-terminal cancellation action (R33)
  const cancelJob = useCallback(async () => {
    if (!jobId) return;
    try {
      await api.post(`/jobs/${jobId}/cancel`);
      setData((prev) =>
        prev
          ? {
              ...prev,
              status: "cancelled",
              isLive: false,
              updatedAt: Date.now(),
            }
          : null,
      );
      setTransport("terminal");
      cleanupConnections();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to cancel job");
    }
  }, [jobId, cleanupConnections]);

  // Manual refetch
  const refetch = useCallback(async () => {
    if (!jobId) return;
    setIsLoading(true);
    await pollStatus();
  }, [jobId, pollStatus]);

  return {
    data,
    isLoading,
    error,
    transport,
    isReconnecting,
    cancelJob,
    refetch,
  };
}
