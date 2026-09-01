/**
 * @sightforge/api-jobs - JobRoom Durable Object Test Suite
 *
 * Verifies live status projection, WebSocket Hibernation, subprotocol ticket auth,
 * D1 rehydration, broadcast, and deduplication per P2 U5 (R29, R30, R31, R115, KTD4, KTD5, KTD12).
 */

import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import { JobRoom } from "./job-room.js";
import { drizzle } from "drizzle-orm/d1";
import { jobs, users } from "@sightforge/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(
  __dirname,
  "../../../packages/db/migrations",
);

/**
 * Mock WebSocket implementation for unit testing.
 */
class MockWebSocket {
  sentMessages: string[] = [];
  closed = false;
  closeCode: number | null = null;
  closeReason: string | null = null;

  send(message: string) {
    this.sentMessages.push(message);
  }

  close(code = 1000, reason = "Normal Closure") {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
  }
}

class MockWebSocketPair {
  0: MockWebSocket;
  1: MockWebSocket;
  constructor() {
    this[0] = new MockWebSocket();
    this[1] = new MockWebSocket();
  }
}

(globalThis as any).WebSocketPair = MockWebSocketPair;

/**
 * Mock DurableObjectState with in-memory storage and WebSocket tracking.
 */
function createMockDOState(): {
  state: DurableObjectState;
  storageMap: Map<string, unknown>;
  acceptedSockets: MockWebSocket[];
} {
  const storageMap = new Map<string, unknown>();
  const acceptedSockets: MockWebSocket[] = [];

  const storage = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return storageMap.get(key) as T | undefined;
    },
    async put(key: string, value: unknown): Promise<void> {
      storageMap.set(key, value);
    },
    async delete(key: string): Promise<boolean> {
      return storageMap.delete(key);
    },
    async list(): Promise<Map<string, unknown>> {
      return new Map(storageMap);
    },
  };

  const state = {
    storage,
    acceptWebSocket(ws: WebSocket, _tags?: string[]) {
      acceptedSockets.push(ws as unknown as MockWebSocket);
    },
    getWebSockets(_tag?: string) {
      return acceptedSockets as unknown as WebSocket[];
    },
  } as unknown as DurableObjectState;

  return { state, storageMap, acceptedSockets };
}

/**
 * Creates in-memory D1 database mock.
 */
async function createMockD1(): Promise<D1Database> {
  const libsql = createClient({ url: ":memory:" });
  await libsql.execute("PRAGMA foreign_keys = ON;");
  const dbLibsql = drizzleLibsql(libsql);
  await migrate(dbLibsql, { migrationsFolder });

  return {
    prepare(query: string) {
      let boundParams: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          boundParams = values;
          return this;
        },
        async first(colName?: string) {
          const res = await libsql.execute({
            sql: query,
            args: boundParams as any,
          });
          const row = res.rows[0];
          if (!row) return null;
          return colName ? row[colName] : row;
        },
        async all() {
          const res = await libsql.execute({
            sql: query,
            args: boundParams as any,
          });
          return { results: res.rows, success: true, meta: {} as any };
        },
        async run() {
          const res = await libsql.execute({
            sql: query,
            args: boundParams as any,
          });
          return { success: true, meta: { changes: res.rowsAffected } as any };
        },
        async raw() {
          const res = await libsql.execute({
            sql: query,
            args: boundParams as any,
          });
          return res.rows.map((r) => Object.values(r));
        },
      } as unknown as D1PreparedStatement;
    },
    async batch(statements: D1PreparedStatement[]) {
      const results: D1Response[] = [];
      for (const stmt of statements) {
        results.push(await (stmt as any).run());
      }
      return results;
    },
    async exec(query: string) {
      await libsql.executeMultiple(query);
      return { count: 1, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  } as unknown as D1Database;
}

describe("JobRoom Durable Object (P2 U5)", () => {
  let mockDb: D1Database;
  const jobId = "job-uuid-1234-5678";
  const userId = "user-uuid-aaaa-1111";

  beforeEach(async () => {
    mockDb = await createMockD1();
    const db = drizzle(mockDb);
    const now = Date.now();

    await db.insert(users).values({
      id: userId,
      email: "tester@example.com",
      clientSalt: "salt1",
      argon2MemoryKib: 19456,
      argon2Iterations: 2,
      argon2Parallelism: 1,
      argon2Version: "0x13",
      serverSalt: "srv1",
      passwordHash: "hash1",
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });

    await db.insert(jobs).values({
      id: jobId,
      userId,
      task: "detection",
      modelVariant: "nano",
      mode: "per-frame",
      mediaType: "video",
      status: "processing",
      originalFilename: "clip.mp4",
      mediaKey: `users/${userId}/media/${jobId}.mp4`,
      mediaEtag: "etag123",
      resultKey: null,
      denseArtifactKey: null,
      confidenceThreshold: 0.25,
      sourceFps: 30,
      sampledFps: 5,
      framesTotal: 100,
      framesCompleted: 45,
      durationMs: null,
      inferenceDurationMs: null,
      coldStartDurationMs: null,
      correlationId: "corr-123",
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  });

  it("rejects WebSocket upgrade from disallowed origin (R115)", async () => {
    const { state } = createMockDOState();
    const env = {
      FRONTEND_ORIGIN: "https://sightforge.app",
      DB: mockDb,
    } as any;

    const room = new JobRoom(state, env);
    const req = new Request("http://localhost/jobs/123/live", {
      headers: {
        Upgrade: "websocket",
        Origin: "https://evil-attacker.com",
        "Sec-WebSocket-Protocol": "ticket.testticket123",
      },
    });

    const res = await room.fetch(req);
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/origin not allowed/i);
  });

  it("rejects WebSocket upgrade without ticket subprotocol (R115, KTD5)", async () => {
    const { state } = createMockDOState();
    const env = {
      FRONTEND_ORIGIN: "https://sightforge.app",
      DB: mockDb,
    } as any;

    const room = new JobRoom(state, env);
    const req = new Request("http://localhost/jobs/123/live", {
      headers: {
        Upgrade: "websocket",
        Origin: "https://sightforge.app",
      },
    });

    const res = await room.fetch(req);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/missing or invalid ticket/i);
  });

  it("rejects replayed, expired, or non-existent tickets (R115, KTD5)", async () => {
    const { state } = createMockDOState();
    const env = {
      FRONTEND_ORIGIN: "https://sightforge.app",
      DB: mockDb,
    } as any;

    const room = new JobRoom(state, env);

    // 1. Non-existent ticket -> 401
    const reqNonExistent = new Request("http://localhost/jobs/123/live", {
      headers: {
        Upgrade: "websocket",
        Origin: "https://sightforge.app",
        "Sec-WebSocket-Protocol": "ticket.unknown_ticket_string_12345",
      },
    });
    const res1 = await room.fetch(reqNonExistent);
    expect(res1.status).toBe(401);

    // 2. Register valid ticket
    const validTicket = "valid_ticket_string_123456";
    const mintReq = new Request("http://job-room/mint-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket: validTicket,
        jobId,
        userId,
        expiresAt: Date.now() + 60_000,
      }),
    });
    await room.fetch(mintReq);

    // 3. First upgrade consumes ticket successfully
    const reqValid = new Request("http://localhost/jobs/123/live", {
      headers: {
        Upgrade: "websocket",
        Origin: "https://sightforge.app",
        "Sec-WebSocket-Protocol": `ticket.${validTicket}`,
      },
    });
    const resValid = await room.fetch(reqValid);
    expect(resValid.status).toBe(101);
    expect(resValid.headers.get("Sec-WebSocket-Protocol")).toBe(
      `ticket.${validTicket}`,
    );

    // 4. Replay of same ticket -> 403 (already consumed)
    const resReplay = await room.fetch(reqValid);
    expect(resReplay.status).toBe(403);
    const replayJson = (await resReplay.json()) as { error: string };
    expect(replayJson.error).toMatch(/already been consumed/i);

    // 5. Expired ticket -> 401
    const expiredTicket = "expired_ticket_string_12345";
    await room.fetch(
      new Request("http://job-room/mint-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: expiredTicket,
          jobId,
          userId,
          expiresAt: Date.now() - 10_000, // Expired in past
        }),
      }),
    );
    const reqExpired = new Request("http://localhost/jobs/123/live", {
      headers: {
        Upgrade: "websocket",
        Origin: "https://sightforge.app",
        "Sec-WebSocket-Protocol": `ticket.${expiredTicket}`,
      },
    });
    const resExpired = await room.fetch(reqExpired);
    expect(resExpired.status).toBe(401);
  });

  it("rehydrates state from D1 row when storage is empty (KTD4)", async () => {
    const { state } = createMockDOState();
    const env = {
      FRONTEND_ORIGIN: "https://sightforge.app",
      DB: mockDb,
    } as any;

    const room = new JobRoom(state, env);

    // Query status on cold DO without memory or storage state
    const statusReq = new Request(`http://job-room/get-status?jobId=${jobId}`);
    const statusRes = await room.fetch(statusReq);
    expect(statusRes.status).toBe(200);

    const json = (await statusRes.json()) as {
      jobId: string;
      status: string;
      framesCompleted: number;
      framesTotal: number;
    };
    expect(json.jobId).toBe(jobId);
    expect(json.status).toBe("processing");
    expect(json.framesCompleted).toBe(45);
    expect(json.framesTotal).toBe(100);
  });

  it("sends current state immediately on connect and broadcasts updates to multiple sockets (R29, R31)", async () => {
    const { state, acceptedSockets } = createMockDOState();
    const env = {
      FRONTEND_ORIGIN: "https://sightforge.app",
      DB: mockDb,
    } as any;

    const room = new JobRoom(state, env);

    // 1. Update state in DO
    await room.fetch(
      new Request("http://job-room/state-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          status: "processing",
          task: "detection",
          framesCompleted: 60,
          framesTotal: 100,
        }),
      }),
    );

    // 2. Connect client A
    const ticketA = "ticket_client_a_1234567890";
    await room.fetch(
      new Request("http://job-room/mint-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: ticketA,
          jobId,
          userId,
          expiresAt: Date.now() + 60_000,
        }),
      }),
    );
    const resA = await room.fetch(
      new Request("http://localhost/jobs/123/live", {
        headers: {
          Upgrade: "websocket",
          Origin: "https://sightforge.app",
          "Sec-WebSocket-Protocol": `ticket.${ticketA}`,
        },
      }),
    );
    expect(resA.status).toBe(101);

    // Verify client A received initial state immediately
    const wsA = acceptedSockets[0]!;
    expect(wsA.sentMessages.length).toBe(1);
    const initialMsg = JSON.parse(wsA.sentMessages[0]!);
    expect(initialMsg.status).toBe("processing");
    expect(initialMsg.framesCompleted).toBe(60);

    // 3. Connect client B
    const ticketB = "ticket_client_b_1234567890";
    await room.fetch(
      new Request("http://job-room/mint-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: ticketB,
          jobId,
          userId,
          expiresAt: Date.now() + 60_000,
        }),
      }),
    );
    const resB = await room.fetch(
      new Request("http://localhost/jobs/123/live", {
        headers: {
          Upgrade: "websocket",
          Origin: "https://sightforge.app",
          "Sec-WebSocket-Protocol": `ticket.${ticketB}`,
        },
      }),
    );
    expect(resB.status).toBe(101);

    // 4. Broadcast a progress update
    await room.fetch(
      new Request("http://job-room/state-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          status: "processing",
          framesCompleted: 85,
          framesTotal: 100,
        }),
      }),
    );

    // Both sockets receive the broadcasted progress update
    const wsB = acceptedSockets[1]!;
    expect(wsA.sentMessages.length).toBe(2);
    expect(wsB.sentMessages.length).toBe(2);

    const updateA = JSON.parse(wsA.sentMessages[1]!);
    const updateB = JSON.parse(wsB.sentMessages[1]!);
    expect(updateA.framesCompleted).toBe(85);
    expect(updateB.framesCompleted).toBe(85);
  });

  it("handles callback deduplication by recording and rejecting replayed delivery IDs (KTD12)", async () => {
    const { state } = createMockDOState();
    const env = {
      FRONTEND_ORIGIN: "https://sightforge.app",
      DB: mockDb,
    } as any;

    const room = new JobRoom(state, env);
    const deliveryId = "modal-delivery-uuid-9999";

    // 1. First callback check -> Allowed
    const req1 = new Request("http://job-room/check-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId }),
    });
    const res1 = await room.fetch(req1);
    expect(res1.status).toBe(200);
    const json1 = (await res1.json()) as { allowed: boolean };
    expect(json1.allowed).toBe(true);

    // 2. Duplicate callback check -> 409 Conflict
    const req2 = new Request("http://job-room/check-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryId }),
    });
    const res2 = await room.fetch(req2);
    expect(res2.status).toBe(409);
    const json2 = (await res2.json()) as { error: string };
    expect(json2.error).toBe("duplicate-delivery");
  });

  it("handles ping/pong message and clean WebSocket closure", async () => {
    const { state } = createMockDOState();
    const env = {
      FRONTEND_ORIGIN: "https://sightforge.app",
      DB: mockDb,
    } as any;

    const room = new JobRoom(state, env);
    const ws = new MockWebSocket();

    // Test ping message
    await room.webSocketMessage(ws as unknown as WebSocket, "ping");
    expect(ws.sentMessages).toContain("pong");

    // Test close handler
    await room.webSocketClose(
      ws as unknown as WebSocket,
      1000,
      "Clean Close",
      true,
    );
    expect(ws.closed).toBe(true);
    expect(ws.closeCode).toBe(1000);
  });
});
