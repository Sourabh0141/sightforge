/**
 * @sightforge/api-jobs - JobRoom Durable Object
 *
 * Implements the live status Durable Object with WebSocket Hibernation,
 * subprotocol ticket authentication, automatic D1 state rehydration,
 * multi-client broadcast, and callback deduplication (R29, R30, R31, R115, KTD4, KTD5, KTD12).
 */

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { jobs, JobStatus } from "@sightforge/db";
import { DEFAULT_ALLOWED_ORIGINS, JobsWorkerEnv } from "@sightforge/worker-kit";

export interface LiveJobState {
  id: string;
  userId?: string;
  task?: string;
  mode?: string;
  mediaType?: string;
  modelVariant?: string;
  status: JobStatus;
  framesCompleted?: number;
  framesTotal?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  inferenceDurationMs?: number | null;
  coldStartDurationMs?: number | null;
  updatedAt: number;
}

export interface TicketRecord {
  ticket: string;
  jobId: string;
  userId: string;
  expiresAt: number;
  consumed: boolean;
  consumedAt?: number;
}

export class JobRoom {
  state: DurableObjectState;
  env: JobsWorkerEnv;
  jobState: LiveJobState | null = null;
  initialized = false;

  constructor(state: DurableObjectState, env: JobsWorkerEnv) {
    this.state = state;
    this.env = env;
  }

  /**
   * Initializes state from DO storage if available.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    const stored = await this.state.storage.get<LiveJobState>("jobState");
    if (stored) {
      this.jobState = stored;
    }
    this.initialized = true;
  }

  /**
   * Rehydrates job state from D1 if DO storage is empty (KTD4).
   */
  private async rehydrateFromDatabase(
    jobId: string,
  ): Promise<LiveJobState | null> {
    if (this.jobState) return this.jobState;
    if (!this.env.DB) return null;

    try {
      const db = drizzle(this.env.DB);
      const row = await db.select().from(jobs).where(eq(jobs.id, jobId)).get();
      if (row) {
        this.jobState = {
          id: row.id,
          userId: row.userId,
          task: row.task,
          mode: row.mode,
          mediaType: row.mediaType,
          modelVariant: row.modelVariant,
          status: row.status as JobStatus,
          framesCompleted: row.framesCompleted ?? 0,
          framesTotal: row.framesTotal,
          errorCode: row.errorCode,
          errorMessage: row.errorMessage,
          durationMs: row.durationMs,
          inferenceDurationMs: row.inferenceDurationMs,
          coldStartDurationMs: row.coldStartDurationMs,
          updatedAt:
            row.updatedAt instanceof Date
              ? row.updatedAt.getTime()
              : Number(row.updatedAt),
        };
        await this.state.storage.put("jobState", this.jobState);
        return this.jobState;
      }
    } catch {
      // Return null on failure; will report gracefully
    }
    return null;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureInitialized();
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 1. WebSocket Upgrade Handshake (R29, R115, KTD5)
    const isWebSocketUpgrade =
      request.headers.get("Upgrade")?.toLowerCase() === "websocket" ||
      path.endsWith("/live") ||
      path.endsWith("/ws");

    if (
      isWebSocketUpgrade &&
      request.headers.get("Upgrade")?.toLowerCase() === "websocket"
    ) {
      return this.handleWebSocketUpgrade(request);
    }

    // 2. HTTP Polling Live Status (GET /get-status or GET /jobs/:id/status)
    if (
      method === "GET" &&
      (path === "/get-status" || path.endsWith("/status"))
    ) {
      return this.handleGetStatus(url);
    }

    // 3. Inbound State Transition / Progress Projection (POST /state-update)
    if (
      method === "POST" &&
      (path === "/state-update" || path.endsWith("/state-update"))
    ) {
      return this.handleStateUpdate(request);
    }

    // 4. Ticket Registration (POST /mint-ticket)
    if (
      method === "POST" &&
      (path === "/mint-ticket" || path.endsWith("/mint-ticket"))
    ) {
      return this.handleMintTicket(request);
    }

    // 5. Callback Deduplication (POST /check-callback) (KTD12)
    if (
      method === "POST" &&
      (path === "/check-callback" || path.endsWith("/check-callback"))
    ) {
      return this.handleCheckCallback(request);
    }

    return new Response(
      JSON.stringify({ error: "Endpoint not found in JobRoom" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Handles WebSocket upgrade, ticket validation, and client attachment.
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const origin = request.headers.get("Origin");
    const allowedOrigins = [
      this.env.FRONTEND_ORIGIN || "https://sightforge.app",
      ...DEFAULT_ALLOWED_ORIGINS,
    ];

    // A. Validate Origin (R115)
    if (!origin || !allowedOrigins.includes(origin)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Origin not allowed." }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // B. Extract ticket from Sec-WebSocket-Protocol (KTD5)
    const protocolsHeader = request.headers.get("Sec-WebSocket-Protocol") || "";
    const protocols = protocolsHeader.split(",").map((p) => p.trim());

    let ticketString: string | null = null;
    let selectedProtocol: string | null = null;

    for (const proto of protocols) {
      if (proto.startsWith("ticket.")) {
        ticketString = proto.slice(7);
        selectedProtocol = proto;
        break;
      } else if (/^[a-zA-Z0-9_-]{20,}$/.test(proto)) {
        ticketString = proto;
        selectedProtocol = proto;
        break;
      }
    }

    if (!ticketString) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized: Missing or invalid ticket subprotocol.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // C. Validate Ticket in DO storage (R115, KTD5)
    const ticketRecord = await this.state.storage.get<TicketRecord>(
      `ticket:${ticketString}`,
    );
    const now = Date.now();

    if (!ticketRecord) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Ticket not found." }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    if (ticketRecord.consumed) {
      return new Response(
        JSON.stringify({
          error: "Forbidden: Ticket has already been consumed.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    if (ticketRecord.expiresAt < now) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Ticket has expired." }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // D. Mark ticket consumed
    ticketRecord.consumed = true;
    ticketRecord.consumedAt = now;
    await this.state.storage.put(`ticket:${ticketString}`, ticketRecord);

    // E. Rehydrate state if cold
    if (!this.jobState && ticketRecord.jobId) {
      await this.rehydrateFromDatabase(ticketRecord.jobId);
    }

    // F. Create WebSocket pair & Accept with Hibernation
    const PairCtor =
      (
        globalThis as unknown as {
          WebSocketPair?: new () => Record<number, WebSocket>;
        }
      ).WebSocketPair ||
      (typeof WebSocketPair !== "undefined"
        ? WebSocketPair
        : class {
            0: any = {};
            1: any = {};
          });
    const webSocketPair = new PairCtor();
    const [clientSocket, serverSocket] = Object.values(webSocketPair) as [
      WebSocket,
      WebSocket,
    ];

    // Accept WebSocket with tag for broadcasting
    this.state.acceptWebSocket(serverSocket, ["job-clients"]);

    // G. Send current state immediately on connect (Approach Step 6)
    if (this.jobState) {
      const initialMessage = JSON.stringify({
        type: "state",
        jobId: this.jobState.id,
        status: this.jobState.status,
        task: this.jobState.task,
        mode: this.jobState.mode,
        mediaType: this.jobState.mediaType,
        framesCompleted: this.jobState.framesCompleted ?? 0,
        framesTotal: this.jobState.framesTotal ?? null,
        errorCode: this.jobState.errorCode ?? null,
        errorMessage: this.jobState.errorMessage ?? null,
        updatedAt: this.jobState.updatedAt,
      });
      serverSocket.send(initialMessage);
    }

    const headers = new Headers();
    if (selectedProtocol) {
      headers.set("Sec-WebSocket-Protocol", selectedProtocol);
    }

    try {
      return new Response(null, {
        status: 101,
        webSocket: clientSocket,
        headers,
      } as unknown as ResponseInit);
    } catch {
      // Polyfill for Node.js / unit testing environments
      const res = new Response(null, {
        status: 200,
        headers,
      });
      Object.defineProperty(res, "status", { value: 101 });
      (res as unknown as { webSocket: WebSocket }).webSocket = clientSocket;
      return res;
    }
  }

  /**
   * Handles polling read of live job status (GET /get-status).
   */
  private async handleGetStatus(url: URL): Promise<Response> {
    const jobIdFromQuery = url.searchParams.get("jobId");
    if (!this.jobState && jobIdFromQuery) {
      await this.rehydrateFromDatabase(jobIdFromQuery);
    }

    if (!this.jobState) {
      return new Response(
        JSON.stringify({
          status: "unknown",
          framesCompleted: 0,
          framesTotal: null,
          isLive: false,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        jobId: this.jobState.id,
        status: this.jobState.status,
        task: this.jobState.task,
        mode: this.jobState.mode,
        mediaType: this.jobState.mediaType,
        framesCompleted: this.jobState.framesCompleted ?? 0,
        framesTotal: this.jobState.framesTotal ?? null,
        errorCode: this.jobState.errorCode ?? null,
        errorMessage: this.jobState.errorMessage ?? null,
        durationMs: this.jobState.durationMs ?? null,
        inferenceDurationMs: this.jobState.inferenceDurationMs ?? null,
        coldStartDurationMs: this.jobState.coldStartDurationMs ?? null,
        updatedAt: this.jobState.updatedAt,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  /**
   * Ingests state transitions and frame progress updates and broadcasts to connected sockets.
   */
  private async handleStateUpdate(request: Request): Promise<Response> {
    const body = (await request.json()) as Partial<LiveJobState> & {
      jobId: string;
      status: JobStatus;
      timestamp?: number;
    };

    if (!body.jobId || !body.status) {
      return new Response(
        JSON.stringify({ error: "Missing jobId or status" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const now = body.timestamp || Date.now();
    this.jobState = {
      id: body.jobId,
      userId: body.userId ?? this.jobState?.userId,
      task: body.task ?? this.jobState?.task,
      mode: body.mode ?? this.jobState?.mode,
      mediaType: body.mediaType ?? this.jobState?.mediaType,
      modelVariant: body.modelVariant ?? this.jobState?.modelVariant,
      status: body.status,
      framesCompleted:
        body.framesCompleted ?? this.jobState?.framesCompleted ?? 0,
      framesTotal:
        body.framesTotal !== undefined
          ? body.framesTotal
          : (this.jobState?.framesTotal ?? null),
      errorCode:
        body.errorCode !== undefined
          ? body.errorCode
          : (this.jobState?.errorCode ?? null),
      errorMessage:
        body.errorMessage !== undefined
          ? body.errorMessage
          : (this.jobState?.errorMessage ?? null),
      durationMs:
        body.durationMs !== undefined
          ? body.durationMs
          : (this.jobState?.durationMs ?? null),
      inferenceDurationMs:
        body.inferenceDurationMs !== undefined
          ? body.inferenceDurationMs
          : (this.jobState?.inferenceDurationMs ?? null),
      coldStartDurationMs:
        body.coldStartDurationMs !== undefined
          ? body.coldStartDurationMs
          : (this.jobState?.coldStartDurationMs ?? null),
      updatedAt: now,
    };

    await this.state.storage.put("jobState", this.jobState);

    // Broadcast to all active WebSocket clients (R29, R31)
    const sockets = this.state.getWebSockets("job-clients");
    const broadcastMessage = JSON.stringify({
      type:
        body.framesCompleted !== undefined && body.status === "processing"
          ? "progress"
          : "state",
      jobId: this.jobState.id,
      status: this.jobState.status,
      task: this.jobState.task,
      framesCompleted: this.jobState.framesCompleted,
      framesTotal: this.jobState.framesTotal,
      errorCode: this.jobState.errorCode,
      errorMessage: this.jobState.errorMessage,
      updatedAt: this.jobState.updatedAt,
    });

    for (const ws of sockets) {
      try {
        ws.send(broadcastMessage);
      } catch {
        // Ignored; closed automatically by hibernation lifecycle
      }
    }

    return new Response(
      JSON.stringify({ success: true, clientCount: sockets.length }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Registers a freshly minted single-use ticket in storage.
   */
  private async handleMintTicket(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      ticket: string;
      jobId: string;
      userId: string;
      expiresAt: number;
    };

    if (!body.ticket || !body.jobId || !body.userId || !body.expiresAt) {
      return new Response(
        JSON.stringify({ error: "Invalid ticket registration payload" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const ticketRecord: TicketRecord = {
      ticket: body.ticket,
      jobId: body.jobId,
      userId: body.userId,
      expiresAt: body.expiresAt,
      consumed: false,
    };

    await this.state.storage.put(`ticket:${body.ticket}`, ticketRecord);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  /**
   * Verifies and records callback delivery identifiers for deduplication (KTD12).
   */
  private async handleCheckCallback(request: Request): Promise<Response> {
    const body = (await request.json()) as { deliveryId: string };
    if (!body.deliveryId) {
      return new Response(JSON.stringify({ error: "Missing deliveryId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const key = `delivery:${body.deliveryId}`;
    const existing = await this.state.storage.get(key);
    if (existing) {
      return new Response(
        JSON.stringify({
          error: "duplicate-delivery",
          message: "Callback already processed.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    await this.state.storage.put(key, {
      deliveryId: body.deliveryId,
      timestamp: Date.now(),
    });

    return new Response(JSON.stringify({ allowed: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // WebSocket Hibernation Interface Event Handlers (R29)
  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message === "string" && message === "ping") {
      ws.send("pong");
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Safe no-op
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    try {
      ws.close(1011, "Internal WebSocket Error");
    } catch {
      // Safe no-op
    }
  }
}
