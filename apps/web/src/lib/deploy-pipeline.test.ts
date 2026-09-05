import { describe, it, expect } from "vitest";
import {
  injectSecrets,
  getWorkerSecretMap,
  getModalSecretMap,
} from "../../../../scripts/inject-secrets.cjs";
import {
  runSmokeTests,
  deriveTestClientKey,
  TURNSTILE_TEST_TOKEN,
} from "../../../../scripts/smoke-test.cjs";

describe("Deployment Pipeline & Out-of-Band Secrets (R76, R93, KTD4)", () => {
  it("defines correct secret inventory mappings for all 5 Cloudflare Workers", () => {
    const workerMap = getWorkerSecretMap();
    expect(workerMap).toHaveProperty("sightforge-api-auth-prod");
    expect(workerMap).toHaveProperty("sightforge-api-jobs-prod");
    expect(workerMap).toHaveProperty("sightforge-events-prod");
    expect(workerMap).toHaveProperty("sightforge-scheduler-prod");
    expect(workerMap).toHaveProperty("sightforge-web-prod");

    // Check auth worker requires JWT_SECRET and TURNSTILE_SECRET_KEY
    const authSecrets = workerMap["sightforge-api-auth-prod"];
    expect(
      authSecrets.some(
        (s: { envVar: string; required: boolean }) =>
          s.envVar === "JWT_SECRET" && s.required,
      ),
    ).toBe(true);
    expect(
      authSecrets.some(
        (s: { envVar: string; required: boolean }) =>
          s.envVar === "TURNSTILE_SECRET_KEY" && s.required,
      ),
    ).toBe(true);

    // Check jobs worker requires JWT_SECRET, INFERENCE_CALLBACK_SECRET, and R2 credentials
    const jobsSecrets = workerMap["sightforge-api-jobs-prod"];
    expect(
      jobsSecrets.some(
        (s: { envVar: string; required: boolean }) =>
          s.envVar === "JWT_SECRET" && s.required,
      ),
    ).toBe(true);
    expect(
      jobsSecrets.some(
        (s: { envVar: string; required: boolean }) =>
          s.envVar === "INFERENCE_CALLBACK_SECRET" && s.required,
      ),
    ).toBe(true);
    expect(
      jobsSecrets.some(
        (s: { envVar: string; required: boolean }) =>
          s.envVar === "R2_MEDIA_ACCESS_KEY_ID" && s.required,
      ),
    ).toBe(true);
    expect(
      jobsSecrets.some(
        (s: { envVar: string; required: boolean }) =>
          s.envVar === "R2_MEDIA_SECRET_ACCESS_KEY" && s.required,
      ),
    ).toBe(true);
  });

  it("defines correct secret inventory for Modal Inference Service", () => {
    const modalMap = getModalSecretMap();
    expect(
      modalMap.some(
        (s: { envVar: string; required: boolean }) =>
          s.envVar === "MODAL_CALLBACK_SECRET" && s.required,
      ),
    ).toBe(true);
  });

  it("runs secret injection in dry-run mode safely without mutations", () => {
    const mockEnv = {
      JWT_SECRET: "mock-jwt-secret-key-32-chars-long!",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
      INFERENCE_CALLBACK_SECRET: "mock-inference-callback-secret-32b",
      R2_MEDIA_ACCESS_KEY_ID: "mock-r2-media-access-key-id",
      R2_MEDIA_SECRET_ACCESS_KEY: "mock-r2-media-secret-access-key",
      MODAL_KEY: "mock-modal-key",
      MODAL_SECRET: "mock-modal-secret",
    };

    const result = injectSecrets({
      isDryRun: true,
      isStrict: true,
      envSource: mockEnv,
    });

    expect(result.success).toBe(true);
    expect(result.missingRequired).toBe(0);
    expect(result.totalInjected).toBeGreaterThanOrEqual(5);
  });

  it("fails strict secret injection when required secrets are missing", () => {
    const incompleteEnv = {
      JWT_SECRET: "some-secret",
    };

    const result = injectSecrets({
      isDryRun: true,
      isStrict: true,
      envSource: incompleteEnv,
    });

    expect(result.success).toBe(false);
    expect(result.missingRequired).toBeGreaterThan(0);
    expect(result.missingSecretsList.length).toBeGreaterThan(0);
  });
});

interface SmokeTestStageResult {
  status?: number;
  healthy?: boolean;
  clientSalt?: string;
  tokenPresent?: boolean;
  jobId?: string;
  uploadUrlPresent?: boolean;
  bytesUploaded?: number;
  jobStatus?: string;
  resultsAccessible?: boolean;
}

interface SmokeTestResult {
  targetUrl: string;
  stages: Record<string, SmokeTestStageResult>;
  passed: boolean;
  durationMs: number;
  jobId?: string | null;
  error?: string;
}

describe("Post-Deployment Smoke Test Suite (R91)", () => {
  it("computes deterministic client key from password and salt", () => {
    const key1 = deriveTestClientKey(
      "TestPassword123!",
      "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    );
    const key2 = deriveTestClientKey(
      "TestPassword123!",
      "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    );
    expect(key1).toBe(key2);
    expect(key1.length).toBe(64); // 32 bytes hex
  });

  it("uses Cloudflare Turnstile documented test token", () => {
    expect(TURNSTILE_TEST_TOKEN).toBe("1x0000000000000000000000000000000AA");
  });

  it("runs full 7-stage smoke test flow in mock mode successfully", async () => {
    const results = (await runSmokeTests({
      targetUrl: "https://test.sightforge.app",
      isMock: true,
    })) as SmokeTestResult;

    expect(results.passed).toBe(true);
    expect(results.stages.health?.healthy).toBe(true);
    expect(results.stages.salt?.clientSalt).toBeDefined();
    expect(results.stages.registration?.tokenPresent).toBe(true);
    expect(results.stages.createJob?.uploadUrlPresent).toBe(true);
    expect(results.stages.upload?.status).toBe(200);
    expect(results.stages.status?.jobStatus).toBe("created");
    expect(results.stages.results?.resultsAccessible).toBe(true);
  });

  it("executes simulated HTTP flow against mock fetch implementation", async () => {
    const mockResponses: Record<string, unknown> = {
      "/health": { status: 200, body: { status: "ready" } },
      "/auth/salt": {
        status: 200,
        body: {
          clientSalt: "11223344556677889900aabbccddeeff",
          argon2Params: {
            memoryKiB: 65536,
            iterations: 3,
            parallelism: 4,
            version: "0x13",
          },
        },
      },
      "/auth/register": {
        status: 201,
        body: {
          accessToken: "mock-jwt-token-12345",
          user: { id: "usr_smoke_test_123", email: "smoke@internal" },
        },
      },
      "/jobs": {
        status: 201,
        body: {
          jobId: "job_smoke_test_456",
          uploadUrl: "https://r2.sightforge.internal/upload/job_456",
          status: "created",
        },
      },
      "https://r2.sightforge.internal/upload/job_456": {
        status: 200,
        body: "",
      },
      "/jobs/job_smoke_test_456/status": {
        status: 200,
        body: { status: "created", progress: 0 },
      },
      "/jobs/job_smoke_test_456/results": {
        status: 200,
        body: { jobId: "job_smoke_test_456", results: [] },
      },
    };

    const mockFetch = async (url: string) => {
      // Sort routes by length descending so most specific routes match first
      const routes = Object.keys(mockResponses).sort(
        (a, b) => b.length - a.length,
      );
      for (const route of routes) {
        if (url.includes(route)) {
          const resp = mockResponses[route] as {
            status: number;
            body: unknown;
          };
          return {
            ok: resp.status >= 200 && resp.status < 300,
            status: resp.status,
            json: async () => resp.body,
            text: async () => JSON.stringify(resp.body),
          };
        }
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "Not Found" }),
        text: async () => "Not Found",
      };
    };

    const results = (await runSmokeTests({
      targetUrl: "https://api.sightforge.app",
      fetchFn: mockFetch,
    })) as SmokeTestResult;

    expect(results.passed).toBe(true);
    expect(results.stages.health?.healthy).toBe(true);
    expect(results.stages.registration?.tokenPresent).toBe(true);
    expect(results.stages.createJob?.jobId).toBe("job_smoke_test_456");
    expect(results.stages.upload?.status).toBe(200);
    expect(results.stages.status?.jobStatus).toBe("created");
  });

  it("handles endpoint errors gracefully and reports failure", async () => {
    const failingFetch = async () => {
      return {
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      };
    };

    const results = (await runSmokeTests({
      targetUrl: "https://api.sightforge.app",
      fetchFn: failingFetch,
    })) as SmokeTestResult;

    expect(results.passed).toBe(false);
    expect(results.error).toContain("Health check failed with HTTP 500");
  });
  it("dynamically resolves Cloudflare workers.dev subdomain when target is unrouted", async () => {
    const subdomainRequests: string[] = [];
    const mockWorkersFetch = async (url: string) => {
      subdomainRequests.push(url);
      if (url.includes("unrouted-domain")) {
        throw new Error("fetch failed (ENOTFOUND)");
      }
      if (url.includes("/health") || url.endsWith(".workers.dev/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "ready" }),
        };
      }
      if (url.includes("/auth/salt")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            clientSalt: "abcd1234abcd1234abcd1234abcd1234",
          }),
        };
      }
      if (url.includes("/auth/register")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            accessToken: "test-jwt-token",
            user: { id: "usr_123" },
          }),
        };
      }
      if (
        url.includes("/jobs") &&
        !url.includes("/status") &&
        !url.includes("/results")
      ) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            jobId: "job_subdomain_789",
            uploadUrl: "https://r2.sightforge.internal/upload/job_789",
            status: "created",
          }),
        };
      }
      if (url.includes("https://r2.sightforge.internal/upload/job_789")) {
        return { ok: true, status: 200 };
      }
      if (url.includes("/jobs/job_subdomain_789/status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "created", progress: 0 }),
        };
      }
      if (url.includes("/jobs/job_subdomain_789/results")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ jobId: "job_subdomain_789", results: [] }),
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "Not Found" }),
      };
    };

    const results = (await runSmokeTests({
      targetUrl: "https://unrouted-domain.sightforge.app",
      subdomain: "test-cf-user",
      fetchFn: mockWorkersFetch,
    })) as SmokeTestResult;

    expect(results.passed).toBe(true);
    expect(results.stages.health?.healthy).toBe(true);
    expect(results.stages.createJob?.jobId).toBe("job_subdomain_789");
    expect(
      subdomainRequests.some((url) =>
        url.includes("sightforge-api-auth-prod.test-cf-user.workers.dev"),
      ),
    ).toBe(true);
    expect(
      subdomainRequests.some((url) =>
        url.includes("sightforge-api-jobs-prod.test-cf-user.workers.dev"),
      ),
    ).toBe(true);
  });
});
