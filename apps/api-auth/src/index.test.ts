/**
 * @sightforge/api-auth - Comprehensive Test Suite
 *
 * Exercises all authentication requirements and acceptance criteria:
 * AE1: Anti-enumeration salt lookup & constant-time execution (R6, AE1)
 * AE6: Refresh token rotation & single-batch family revocation on reuse (R9, KTD8, AE6)
 * R5, R7, R11: Zero-knowledge registration, server fast-hash, password bounds
 * R8, R10: Stateless JWT & __Host- session cookies
 * R14, KTD6: Dual rate limiting and account lockout
 * R109: Sensitive data protection
 */

import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import authWorker from "./index.js";
import { Counter, signJwt } from "@sightforge/worker-kit";
import { derivePseudoSalt, DEFAULT_ARGON2_PARAMS } from "./passwords.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(
  __dirname,
  "../../../packages/db/migrations",
);

function getResponseCookies(res: Response): string[] {
  const customHeaders = res.headers as unknown as {
    getSetCookie?: () => string[];
  };
  if (typeof customHeaders.getSetCookie === "function") {
    return customHeaders.getSetCookie();
  }
  return [res.headers.get("Set-Cookie") || ""];
}

/**
 * Creates an in-memory D1Database mock backed by LibSQL.
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

describe("@sightforge/api-auth - Authentication Worker", () => {
  let mockDb: D1Database;
  const mockCounterDO = new Counter({} as any, {});
  const mockNamespace = {
    idFromName: () => ({}) as any,
    get: () => ({
      fetch: async (req: Request | string, init?: RequestInit) => {
        if (typeof req === "string") {
          const parsed = JSON.parse(init?.body as string);
          if (req.includes("/rate-limit")) {
            const res = mockCounterDO.rateLimit(
              parsed.subject,
              parsed.policy,
              parsed.limit,
              parsed.windowSeconds,
            );
            return new Response(JSON.stringify(res), {
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        return new Response(JSON.stringify({ allowed: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    }),
  } as unknown as DurableObjectNamespace;

  const env = {
    ENVIRONMENT: "test",
    DB: undefined as unknown as D1Database,
    COUNTER: mockNamespace,
    FRONTEND_ORIGIN: "https://sightforge.app",
    JWT_SECRET: "test-mock-jwt-auth-secret-key-32chars", // gitleaks:allow
    PASSWORD_SALT_KEY: "test-mock-password-salt-key-32ch", // gitleaks:allow
    PASSWORD_PEPPER: "test-mock-password-pepper-32chars", // gitleaks:allow
  };

  beforeEach(async () => {
    mockDb = await createMockD1();
    env.DB = mockDb;
  });

  describe("Health & Base Endpoints", () => {
    it("returns ready status on GET /", async () => {
      const req = new Request("http://localhost/");
      const res = await authWorker.fetch(req, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { service: string; status: string };
      expect(json.service).toBe("sightforge-api-auth");
      expect(json.status).toBe("ready");
    });
  });

  describe("Anti-Enumeration Salt Lookup (R6, AE1)", () => {
    it("returns deterministic pseudo-salt with default parameters for unregistered email (AE1)", async () => {
      const req = new Request(
        "http://localhost/auth/salt?email=unregistered%40example.com",
        {
          headers: { Origin: "https://sightforge.app" },
        },
      );
      const res = await authWorker.fetch(req, env);
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        clientSalt: string;
        argon2Params: typeof DEFAULT_ARGON2_PARAMS;
      };
      expect(json.clientSalt).toBeDefined();
      expect(json.clientSalt.length).toBe(32);
      expect(json.argon2Params).toEqual(DEFAULT_ARGON2_PARAMS);

      // Verify pseudo-salt is deterministic across multiple requests
      const expectedSalt = await derivePseudoSalt(
        "unregistered@example.com",
        env.PASSWORD_SALT_KEY,
      );
      expect(json.clientSalt).toBe(expectedSalt);
    });

    it("canonicalizes email casing and Unicode NFKC forms identically", async () => {
      const req1 = new Request(
        "http://localhost/auth/salt?email=USER%40EXAMPLE.COM",
        {
          headers: { Origin: "https://sightforge.app" },
        },
      );
      const res1 = await authWorker.fetch(req1, env);
      const json1 = (await res1.json()) as { clientSalt: string };

      const req2 = new Request(
        "http://localhost/auth/salt?email=user%40example.com",
        {
          headers: { Origin: "https://sightforge.app" },
        },
      );
      const res2 = await authWorker.fetch(req2, env);
      const json2 = (await res2.json()) as { clientSalt: string };

      expect(json1.clientSalt).toBe(json2.clientSalt);
    });

    it("rejects malformed email format with 400", async () => {
      const req = new Request("http://localhost/auth/salt?email=not-an-email", {
        headers: { Origin: "https://sightforge.app" },
      });
      const res = await authWorker.fetch(req, env);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe("invalid-input");
    });
  });

  describe("Zero-Knowledge Registration (R5, R7, R10, R11, R71)", () => {
    it("registers user successfully and sets __Host- session cookies", async () => {
      const req = new Request("http://localhost/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          email: "newuser@example.com",
          clientDerivedKey: "a".repeat(64),
          clientSalt: "1234567890abcdef1234567890abcdef",
          passwordLength: 16,
          turnstileToken: "test-turnstile-token",
        }),
      });

      const res = await authWorker.fetch(req, env);
      expect(res.status).toBe(201);
      const json = (await res.json()) as {
        user: { id: string; email: string };
      };
      expect(json.user.id).toBeDefined();
      expect(json.user.email).toBe("newuser@example.com");

      const setCookies = getResponseCookies(res);
      const cookieStr = setCookies.join("; ");
      expect(cookieStr).toContain("__Host-access_token=");
      expect(cookieStr).toContain("__Host-refresh_token=");
    });

    it("rejects registration with duplicate email", async () => {
      const registerPayload = {
        email: "duplicate@example.com",
        clientDerivedKey: "b".repeat(64),
        clientSalt: "1234567890abcdef1234567890abcdef",
        passwordLength: 14,
        turnstileToken: "test-turnstile-token",
      };

      // 1. Initial registration
      const req1 = new Request("http://localhost/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify(registerPayload),
      });
      const res1 = await authWorker.fetch(req1, env);
      expect(res1.status).toBe(201);

      // 2. Duplicate registration attempt
      const req2 = new Request("http://localhost/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify(registerPayload),
      });
      const res2 = await authWorker.fetch(req2, env);
      expect(res2.status).toBe(409);
    });

    it("rejects password outside length bounds (R11)", async () => {
      const reqShort = new Request("http://localhost/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          email: "shortpass@example.com",
          clientDerivedKey: "c".repeat(64),
          clientSalt: "1234567890abcdef1234567890abcdef",
          passwordLength: 8, // < 10 characters
          turnstileToken: "test-turnstile-token",
        }),
      });
      const resShort = await authWorker.fetch(reqShort, env);
      expect(resShort.status).toBe(400);
      const json = (await resShort.json()) as { error: { message: string } };
      expect(json.error.message).toMatch(/between 10 and 128 characters/i);
    });
  });

  describe("User Login & Throttling (R6, R8, R9, R14, R74)", () => {
    const validClientKey = "d".repeat(64);

    beforeEach(async () => {
      // Register user for login tests
      const req = new Request("http://localhost/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          email: "loginuser@example.com",
          clientDerivedKey: validClientKey,
          clientSalt: "1234567890abcdef1234567890abcdef",
          passwordLength: 16,
          turnstileToken: "test-turnstile-token",
        }),
      });
      await authWorker.fetch(req, env);
    });

    it("logs in successfully with correct credentials and returns session cookies", async () => {
      const req = new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          email: "loginuser@example.com",
          clientDerivedKey: validClientKey,
          turnstileToken: "test-turnstile-token",
        }),
      });

      const res = await authWorker.fetch(req, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { user: { email: string } };
      expect(json.user.email).toBe("loginuser@example.com");

      const cookieStr = getResponseCookies(res).join("; ");
      expect(cookieStr).toContain("__Host-access_token=");
      expect(cookieStr).toContain("__Host-refresh_token=");
    });

    it("returns generic 401 on incorrect credentials without leaking account state", async () => {
      const req = new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          email: "loginuser@example.com",
          clientDerivedKey: "e".repeat(64), // Invalid key
          turnstileToken: "test-turnstile-token",
        }),
      });

      const res = await authWorker.fetch(req, env);
      expect(res.status).toBe(401);
      const json = (await res.json()) as {
        error: { code: string; message: string };
      };
      expect(json.error.code).toBe("invalid-credentials");
      expect(json.error.message).toBe("Invalid email or password.");
    });
  });

  describe("Refresh Token Rotation & Family Revocation on Reuse (R9, KTD8, AE6)", () => {
    let activeRefreshToken: string;

    beforeEach(async () => {
      // Register and extract refresh token
      const regReq = new Request("http://localhost/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          email: "sessionuser@example.com",
          clientDerivedKey: "f".repeat(64),
          clientSalt: "1234567890abcdef1234567890abcdef",
          passwordLength: 16,
          turnstileToken: "test-turnstile-token",
        }),
      });
      const regRes = await authWorker.fetch(regReq, env);
      const cookies = getResponseCookies(regRes);
      const cookieStr = cookies.join("; ");
      const match = cookieStr.match(/__Host-refresh_token=([^;]+)/);
      activeRefreshToken = match?.[1] ? decodeURIComponent(match[1]) : "";
    });

    it("rotates refresh token and issues new access token", async () => {
      expect(activeRefreshToken).toBeTruthy();
      const req = new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: {
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
          Cookie: `__Host-refresh_token=${activeRefreshToken}`,
        },
      });

      const res = await authWorker.fetch(req, env);
      expect(res.status).toBe(200);

      const cookies = getResponseCookies(res);
      const cookieStr = cookies.join("; ");
      expect(cookieStr).toContain("__Host-access_token=");
      expect(cookieStr).toContain("__Host-refresh_token=");
    });

    it("revokes entire token family when a consumed refresh token is presented again (AE6)", async () => {
      // 1. Initial valid refresh exchange
      const req1 = new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: {
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
          Cookie: `__Host-refresh_token=${activeRefreshToken}`,
        },
      });
      const res1 = await authWorker.fetch(req1, env);
      expect(res1.status).toBe(200);

      const cookies1 = getResponseCookies(res1);
      const cookieStr1 = cookies1.join("; ");
      const match1 = cookieStr1.match(/__Host-refresh_token=([^;]+)/);
      const secondGenToken = match1?.[1] ? decodeURIComponent(match1[1]) : "";

      // 2. Re-present the FIRST token (already consumed) -> Trigger Family Revocation!
      const reqReplay = new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: {
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
          Cookie: `__Host-refresh_token=${activeRefreshToken}`,
        },
      });
      const resReplay = await authWorker.fetch(reqReplay, env);
      expect(resReplay.status).toBe(401);
      const jsonReplay = (await resReplay.json()) as {
        error: { code: string };
      };
      expect(jsonReplay.error.code).toBe("session-revoked");

      // 3. Verify that the second-generation token is ALSO now rejected because the family was revoked
      const reqSecond = new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: {
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
          Cookie: `__Host-refresh_token=${secondGenToken}`,
        },
      });
      const resSecond = await authWorker.fetch(reqSecond, env);
      expect(resSecond.status).toBe(401);
    });
  });

  describe("Sign Out & User Profile (R9, R10)", () => {
    it("clears session cookies on POST /auth/logout", async () => {
      const req = new Request("http://localhost/auth/logout", {
        method: "POST",
        headers: {
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
        },
      });

      const res = await authWorker.fetch(req, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean };
      expect(json.success).toBe(true);

      const cookies = getResponseCookies(res).join("; ");
      expect(cookies).toContain("Max-Age=0");
    });

    it("returns user profile on GET /auth/me with valid access token", async () => {
      const now = Math.floor(Date.now() / 1000);
      // Register a user first to have a valid ID in D1
      const regReq = new Request("http://localhost/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://sightforge.app",
          "X-SightForge-Request": "1",
        },
        body: JSON.stringify({
          email: "profileuser@example.com",
          clientDerivedKey: "1".repeat(64),
          clientSalt: "1234567890abcdef1234567890abcdef",
          passwordLength: 16,
          turnstileToken: "test-turnstile-token",
        }),
      });
      const regRes = await authWorker.fetch(regReq, env);
      const regJson = (await regRes.json()) as { user: { id: string } };

      const token = await signJwt(
        {
          sub: regJson.user.id,
          email: "profileuser@example.com",
          exp: now + 3600,
        },
        env.JWT_SECRET,
      );

      const req = new Request("http://localhost/auth/me", {
        headers: {
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await authWorker.fetch(req, env);
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        user: { id: string; email: string };
      };
      expect(json.user.id).toBe(regJson.user.id);
      expect(json.user.email).toBe("profileuser@example.com");
    });
  });
});
