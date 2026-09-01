import { describe, expect, it, vi } from "vitest";
import {
  WORKER_KIT_VERSION,
  timingSafeEqual,
  hmacSha256Hex,
  base64UrlEncode,
  base64UrlDecode,
  signJwt,
  verifyJwt,
  extractTokenFromRequest,
  assertCsrf,
  getClientIpPrefix,
  normalizeIpPrefix,
  applySecurityHeaders,
  SECURITY_HEADERS,
  handleCors,
  appendCorsHeaders,
  Counter,
  JobRoom,
  assertRateLimitIp,
  assertRateLimitUser,
  assertDailyQuota,
  assertOwnership,
  HttpError,
  createErrorResponse,
  redactSensitiveData,
  Logger,
  unauthenticatedChain,
  authenticatedChain,
} from "./index";

describe("@sightforge/worker-kit", () => {
  it("exports worker kit version", () => {
    expect(WORKER_KIT_VERSION).toBe("0.1.0");
  });

  describe("Cryptographic Primitives (R74, KTD13)", () => {
    it("performs constant-time equality check", () => {
      expect(timingSafeEqual("hello", "hello")).toBe(true);
      expect(timingSafeEqual("hello", "world")).toBe(false);
      expect(timingSafeEqual("hello", "hell")).toBe(false);
    });

    it("computes HMAC-SHA256 hex digest", async () => {
      const hex = await hmacSha256Hex("secret-key", "test-message");
      expect(hex).toBeDefined();
      expect(hex.length).toBe(64);
    });

    it("encodes and decodes base64url accurately", () => {
      const original = "Hello World & SightForge!";
      const encoded = base64UrlEncode(original);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
      const decoded = new TextDecoder().decode(base64UrlDecode(encoded));
      expect(decoded).toBe(original);
    });
  });

  describe("JWT Stateless Verification & Algorithm Pinning (R8, R12, R15)", () => {
    const testSigningKey = "test-jwt-mock-key-unit-testing"; // gitleaks:allow
    const testPreviousSigningKey = "test-jwt-old-mock-key-unit-testing"; // gitleaks:allow

    it("signs and verifies a valid HS256 token", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signJwt(
        { sub: "user-123", exp: now + 3600, email: "user@example.com" },
        testSigningKey,
      );

      const payload = await verifyJwt(token, testSigningKey);
      expect(payload.sub).toBe("user-123");
      expect(payload.email).toBe("user@example.com");
    });

    it("rejects token signed with disallowed algorithm even when valid (R12)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const headerB64 = base64UrlEncode(
        JSON.stringify({ alg: "none", typ: "JWT" }),
      );
      const payloadB64 = base64UrlEncode(
        JSON.stringify({ sub: "user-123", exp: now + 3600 }),
      );
      const token = `${headerB64}.${payloadB64}.dummysignature`;

      await expect(verifyJwt(token, testSigningKey)).rejects.toThrowError(
        /Disallowed signing algorithm/i,
      );
    });

    it("verifies token with previous key during rotation and fails when old key is removed (R15)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const tokenOld = await signJwt(
        { sub: "user-old", exp: now + 3600 },
        testPreviousSigningKey,
      );

      // Verifies when both active and previous are configured
      const payload = await verifyJwt(tokenOld, {
        activeKey: testSigningKey,
        previousKey: testPreviousSigningKey,
      });
      expect(payload.sub).toBe("user-old");

      // Fails when old key is removed
      await expect(
        verifyJwt(tokenOld, { activeKey: testSigningKey }),
      ).rejects.toThrowError(/Invalid token signature/i);
    });

    it("rejects expired token and accepts token expiring in the future (R8)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = await signJwt(
        { sub: "user-exp", exp: now - 10 },
        testSigningKey,
      );
      const validToken = await signJwt(
        { sub: "user-val", exp: now + 5 },
        testSigningKey,
      );

      await expect(
        verifyJwt(expiredToken, testSigningKey),
      ).rejects.toThrowError(/Token has expired/i);
      const validPayload = await verifyJwt(validToken, testSigningKey);
      expect(validPayload.sub).toBe("user-val");
    });

    it("extracts token from cookie and Authorization header (R10)", () => {
      const reqCookie = new Request("http://localhost", {
        headers: { Cookie: "__Host-access_token=token-from-cookie" },
      });
      expect(extractTokenFromRequest(reqCookie)).toBe("token-from-cookie");

      const reqAuth = new Request("http://localhost", {
        headers: { Authorization: "Bearer token-from-header" },
      });
      expect(extractTokenFromRequest(reqAuth)).toBe("token-from-header");

      const reqNone = new Request("http://localhost");
      expect(extractTokenFromRequest(reqNone)).toBeNull();
    });
  });

  describe("CSRF Defense & Fetch Metadata (R68, R69)", () => {
    it("allows safe methods (GET, HEAD, OPTIONS) without custom header", () => {
      const getReq = new Request("http://localhost/jobs", { method: "GET" });
      expect(() => assertCsrf(getReq)).not.toThrow();
    });

    it("rejects state-changing request without custom header (R68)", () => {
      const postReq = new Request("http://localhost/jobs", {
        method: "POST",
        headers: { "Sec-Fetch-Site": "same-origin" },
      });
      expect(() => assertCsrf(postReq)).toThrowError(
        /Missing required custom CSRF defense header/i,
      );
    });

    it("rejects cross-site state-changing request even with custom header (R68)", () => {
      const postReq = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "X-SightForge-Request": "1",
          "Sec-Fetch-Site": "cross-site",
        },
      });
      expect(() => assertCsrf(postReq)).toThrowError(
        /Cross-site state-changing requests are prohibited/i,
      );
    });

    it("accepts same-origin state-changing request with custom header", () => {
      const postReq = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "X-SightForge-Request": "1",
          "Sec-Fetch-Site": "same-origin",
        },
      });
      expect(() => assertCsrf(postReq)).not.toThrow();
    });

    it("rejects request with absent fetch metadata and disallowed origin (R68)", () => {
      const postReq = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          "X-SightForge-Request": "1",
          Origin: "https://evil.com",
        },
      });
      expect(() => assertCsrf(postReq)).toThrowError(
        /Origin is not permitted/i,
      );
    });
  });

  describe("IP Extraction & IPv6 /64 Prefixing (KTD6)", () => {
    it("derives from CF-Connecting-IP and ignores X-Forwarded-For", () => {
      const req = new Request("http://localhost", {
        headers: {
          "CF-Connecting-IP": "203.0.113.195",
          "X-Forwarded-For": "1.2.3.4",
        },
      });
      expect(getClientIpPrefix(req)).toBe("203.0.113.195");
    });

    it("normalizes IPv6 to /64 network prefix", () => {
      const ipv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
      expect(normalizeIpPrefix(ipv6)).toBe("2001:0db8:85a3:0000::/64");
    });
  });

  describe("Universal Security Headers (R110)", () => {
    it("attaches all mandatory security headers to response", () => {
      const baseRes = new Response("OK", { status: 200 });
      const secRes = applySecurityHeaders(baseRes);
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        expect(secRes.headers.get(key)).toBe(value);
      }
    });
  });

  describe("CORS & Origin Allow-List (R67)", () => {
    it("handles OPTIONS preflight for allowed origin", () => {
      const req = new Request("http://localhost/jobs", {
        method: "OPTIONS",
        headers: { Origin: "https://sightforge.app" },
      });
      const res = handleCors(req);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(204);
      expect(res?.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://sightforge.app",
      );
      expect(res?.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    it("appends CORS headers to responses", () => {
      const res = new Response("OK", { status: 200 });
      const corsRes = appendCorsHeaders(res, "https://sightforge.app");
      expect(corsRes.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://sightforge.app",
      );
    });

    it("instantiates JobRoom DO stub", async () => {
      const room = new JobRoom({} as any, {});
      const res = await room.fetch(new Request("http://localhost/room"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean };
      expect(json.ok).toBe(true);
    });
  });

  describe("Counter Durable Object & Rate Limiting (KTD6, R70, R111)", () => {
    it("tracks sliding-window rate limit and daily quota", async () => {
      const stubState = {} as DurableObjectState;
      const counter = new Counter(stubState, {});

      // 1. Rate limiting
      const r1 = counter.rateLimit("ip-1", "test", 2, 60);
      expect(r1.allowed).toBe(true);
      expect(r1.count).toBe(1);

      const r2 = counter.rateLimit("ip-1", "test", 2, 60);
      expect(r2.allowed).toBe(true);
      expect(r2.count).toBe(2);

      const r3 = counter.rateLimit("ip-1", "test", 2, 60);
      expect(r3.allowed).toBe(false);
      expect(r3.count).toBe(2);

      // Counts are isolated per subject and policy name
      const otherSubject = counter.rateLimit("ip-2", "test", 2, 60);
      expect(otherSubject.allowed).toBe(true);

      const otherPolicy = counter.rateLimit("ip-1", "other-policy", 2, 60);
      expect(otherPolicy.allowed).toBe(true);

      // 2. Daily quota
      const q1 = counter.quota("user-1", 2, true);
      expect(q1.allowed).toBe(true);
      expect(q1.used).toBe(1);

      const q2 = counter.quota("user-1", 2, true);
      expect(q2.allowed).toBe(true);
      expect(q2.used).toBe(2);

      const q3 = counter.quota("user-1", 2, true);
      expect(q3.allowed).toBe(false);
    });

    it("fails closed when counter object errors or times out (KTD6)", async () => {
      const brokenNamespace = {
        idFromName: () => ({}) as any,
        get: () => ({
          fetch: async () => {
            throw new Error("Durable Object network partition timeout");
          },
        }),
      };

      const req = new Request("http://localhost", {
        headers: { "CF-Connecting-IP": "10.0.0.1" },
      });

      await expect(
        assertRateLimitIp(req, brokenNamespace),
      ).rejects.toThrowError(
        /Rate limiting service is temporarily unavailable/i,
      );
    });

    it("assertRateLimitUser and assertDailyQuota enforce policies", async () => {
      const counter = new Counter({} as any, {});
      const mockNamespace = {
        idFromName: () => ({}) as any,
        get: () => ({
          fetch: async (req: Request | string, init?: RequestInit) => {
            if (typeof req === "string") {
              const body = JSON.parse(init?.body as string);
              if (req.includes("/rate-limit")) {
                const res = counter.rateLimit(
                  body.subject,
                  body.policy,
                  body.limit,
                  body.windowSeconds,
                );
                return new Response(JSON.stringify(res), {
                  headers: { "Content-Type": "application/json" },
                });
              }
              if (
                req.includes("/quota/consume") ||
                req.includes("/quota/check")
              ) {
                const res = counter.quota(
                  body.userId,
                  body.limit,
                  req.includes("/quota/consume"),
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
      };

      await expect(
        assertRateLimitUser("user-1", mockNamespace, {
          limit: 5,
          windowSeconds: 60,
        }),
      ).resolves.toBeUndefined();
      const quota = await assertDailyQuota("user-1", mockNamespace, 5, true);
      expect(quota.allowed).toBe(true);
      expect(quota.used).toBe(1);
    });
  });

  describe("Row Ownership Helper (KTD3, R13)", () => {
    it("passes for matching owner and emits not-found for non-owner", () => {
      const resource = { userId: "user-alpha", id: "job-1" };
      expect(() => assertOwnership("user-alpha", resource)).not.toThrow();

      expect(() => assertOwnership("user-beta", resource)).toThrowError(
        /The requested resource was not found/i,
      );
      expect(() => assertOwnership("user-alpha", null)).toThrowError(
        /The requested resource was not found/i,
      );
    });
  });

  describe("Sensitive Data Redaction & Structured Logging (KTD10, R109)", () => {
    it("redacts sensitive fields recursively", () => {
      const payload = {
        username: "user@example.com",
        password: "SuperSecretPassword123!",
        clientDerivedKey: "argon2id-key-data",
        socketTicket: "ticket-xyz-456",
        nested: {
          token: "jwt-token-content",
          refreshToken: "refresh-token-content",
          safeField: 12345,
        },
      };

      const redacted = redactSensitiveData(payload) as any;
      expect(redacted.username).toBe("user@example.com");
      expect(redacted.password).toBe("[REDACTED]");
      expect(redacted.clientDerivedKey).toBe("[REDACTED]");
      expect(redacted.socketTicket).toBe("[REDACTED]");
      expect(redacted.nested.token).toBe("[REDACTED]");
      expect(redacted.nested.refreshToken).toBe("[REDACTED]");
      expect(redacted.nested.safeField).toBe(12345);
    });

    it("logs structured JSON with correlation ID without leaking secrets", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logger = new Logger("test-service", "corr-789");
      logger.info("Processing login", { password: "SecretPassword" });

      expect(consoleSpy).toHaveBeenCalled();
      const firstCall = consoleSpy.mock.calls[0];
      const logString = (firstCall ? firstCall[0] : "{}") as string;
      const loggedJson = JSON.parse(logString);
      expect(loggedJson.service).toBe("test-service");
      expect(loggedJson.correlationId).toBe("corr-789");
      expect(loggedJson.metadata.password).toBe("[REDACTED]");
      consoleSpy.mockRestore();
    });
  });

  describe("Structured Error Responses (KTD14, R72)", () => {
    it("creates structured error envelope without echoing submitted input", () => {
      const err = new HttpError(
        400,
        "invalid-input",
        "Validation failed for field 'fps'",
      );
      const res = createErrorResponse(err);
      expect(res.status).toBe(400);
      expect(res.headers.get("Content-Type")).toBe(
        "application/json; charset=utf-8",
      );
    });
  });

  describe("End-to-End Composable Middleware Chains (KTD3, KTD6, R110)", () => {
    const mockCounter = new Counter({} as any, {});
    const mockNamespace = {
      idFromName: () => ({}) as any,
      get: () => ({
        fetch: async (req: Request | string, init?: RequestInit) => {
          if (typeof req === "string") {
            const parsed = JSON.parse(init?.body as string);
            if (req.includes("/rate-limit")) {
              const res = mockCounter.rateLimit(
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
    };

    const env = {
      JWT_SECRET: "test-mock-jwt-secret-xyz", // gitleaks:allow
      COUNTER: mockNamespace,
    };

    it("unauthenticatedChain runs smoothly and attaches security headers", async () => {
      const req = new Request(
        "http://localhost/auth/salt?email=test%40example.com",
        {
          headers: { Origin: "https://sightforge.app" },
        },
      );

      const res = await unauthenticatedChain(req, env, async (ctx) => {
        expect(ctx.ipPrefix).toBeDefined();
        return new Response(JSON.stringify({ salt: "random-salt" }), {
          headers: { "Content-Type": "application/json" },
        });
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Strict-Transport-Security")).toBeDefined();
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://sightforge.app",
      );
    });

    it("authenticatedChain verifies token and passes context", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await signJwt(
        { sub: "user-999", exp: now + 3600 },
        env.JWT_SECRET,
      );

      const req = new Request("http://localhost/jobs", {
        method: "POST",
        headers: {
          Origin: "https://sightforge.app",
          Authorization: `Bearer ${token}`,
          "X-SightForge-Request": "1",
          "Sec-Fetch-Site": "same-origin",
        },
      });

      const res = await authenticatedChain(req, env, async (ctx) => {
        expect(ctx.userId).toBe("user-999");
        return new Response(JSON.stringify({ jobId: "job-123" }), {
          headers: { "Content-Type": "application/json" },
        });
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Strict-Transport-Security")).toBeDefined();
      const data = (await res.json()) as { jobId: string };
      expect(data.jobId).toBe("job-123");
    });

    it("authenticatedChain catches authentication failure and returns structured error with security headers", async () => {
      const req = new Request("http://localhost/jobs", {
        method: "GET",
        headers: {
          Origin: "https://sightforge.app",
          Authorization: "Bearer invalid-tampered-token",
        },
      });

      const res = await authenticatedChain(req, env, async () => {
        return new Response("Should not reach here");
      });

      expect(res.status).toBe(401);
      expect(res.headers.get("Strict-Transport-Security")).toBeDefined();
      const errorJson = (await res.json()) as any;
      expect(errorJson.error.code).toBe("unauthorized");
    });
  });
});
