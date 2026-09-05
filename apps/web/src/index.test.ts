import { describe, expect, it, vi } from "vitest";
import worker, { extractSubdomain, isApiRoute } from "./index";

describe("sightforge-web worker", () => {
  it("extracts subdomain accurately from workers.dev hostnames", () => {
    expect(
      extractSubdomain("sightforge-web-prod.sourabh-sharma0141.workers.dev"),
    ).toBe("sourabh-sharma0141");
    expect(extractSubdomain("custom-domain.sightforge.app")).toBeNull();
    expect(extractSubdomain("localhost")).toBeNull();
  });

  it("identifies API routes vs static SPA pages correctly", () => {
    // Auth routes are always API
    const authReq = new Request("https://site.workers.dev/auth/me");
    expect(isApiRoute("/auth/me", authReq)).toBe(true);

    // Jobs subroutes are API
    const jobStatusReq = new Request(
      "https://site.workers.dev/jobs/job_123/status",
    );
    expect(isApiRoute("/jobs/job_123/status", jobStatusReq)).toBe(true);

    // Jobs POST is API
    const jobPostReq = new Request("https://site.workers.dev/jobs", {
      method: "POST",
    });
    expect(isApiRoute("/jobs", jobPostReq)).toBe(true);

    // Jobs GET with X-SightForge-Request header is API
    const jobApiGetReq = new Request("https://site.workers.dev/jobs", {
      headers: { "X-SightForge-Request": "1" },
    });
    expect(isApiRoute("/jobs", jobApiGetReq)).toBe(true);

    // Jobs GET browser page navigation is NOT API (serves SPA)
    const jobPageReq = new Request("https://site.workers.dev/jobs", {
      headers: { accept: "text/html" },
    });
    expect(isApiRoute("/jobs", jobPageReq)).toBe(false);

    // Gallery or landing page is NOT API
    const galleryReq = new Request("https://site.workers.dev/gallery");
    expect(isApiRoute("/gallery", galleryReq)).toBe(false);
  });

  it("responds to /health probe with service status", async () => {
    const req = new Request(
      "https://sightforge-web-prod.test.workers.dev/health",
    );
    const res = await worker.fetch(req, { ENVIRONMENT: "test-env" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      status: string;
      service: string;
      environment: string;
    };
    expect(data.status).toBe("ready");
    expect(data.service).toBe("sightforge-web");
    expect(data.environment).toBe("test-env");
  });

  it("proxies /auth requests to sibling auth worker on workers.dev", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "usr_1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = mockFetch;

    try {
      const req = new Request(
        "https://sightforge-web-prod.my-subdomain.workers.dev/auth/me",
        {
          headers: { "X-SightForge-Request": "1" },
        },
      );

      const res = await worker.fetch(req);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://sightforge-api-auth-prod.my-subdomain.workers.dev/auth/me",
        expect.objectContaining({ method: "GET" }),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as { user: { id: string } };
      expect(data.user.id).toBe("usr_1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("proxies /jobs requests to sibling jobs worker on workers.dev", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobs: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = mockFetch;

    try {
      const req = new Request(
        "https://sightforge-web-prod.my-subdomain.workers.dev/jobs",
        {
          headers: { "X-SightForge-Request": "1" },
        },
      );

      const res = await worker.fetch(req);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://sightforge-api-jobs-prod.my-subdomain.workers.dev/jobs",
        expect.objectContaining({ method: "GET" }),
      );
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("proxies /events and /callbacks requests to sibling events worker on workers.dev", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = mockFetch;

    try {
      const req = new Request(
        "https://sightforge-web-prod.my-subdomain.workers.dev/callbacks/progress",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Host: "sightforge-web-prod.my-subdomain.workers.dev",
          },
          body: JSON.stringify({ jobId: "job_1" }),
        },
      );

      const res = await worker.fetch(req);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://sightforge-events-prod.my-subdomain.workers.dev/callbacks/progress",
        expect.objectContaining({ method: "POST" }),
      );
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses service bindings directly when configured", async () => {
    const mockAuthService = {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    };
    const mockJobsService = {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ jobs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    };
    const mockEventsService = {
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    };

    const authReq = new Request("https://custom.sightforge.app/auth/logout", {
      method: "POST",
    });
    const jobsReq = new Request("https://custom.sightforge.app/jobs", {
      method: "GET",
      headers: { "X-SightForge-Request": "1" },
    });
    const eventsReq = new Request(
      "https://custom.sightforge.app/callbacks/complete",
      {
        method: "POST",
      },
    );

    const env = {
      AUTH_SERVICE: mockAuthService,
      JOBS_SERVICE: mockJobsService,
      EVENTS_SERVICE: mockEventsService,
    };

    const resAuth = await worker.fetch(authReq, env);
    expect(mockAuthService.fetch).toHaveBeenCalledWith(authReq);
    expect(resAuth.status).toBe(200);

    const resJobs = await worker.fetch(jobsReq, env);
    expect(mockJobsService.fetch).toHaveBeenCalledWith(jobsReq);
    expect(resJobs.status).toBe(200);

    const resEvents = await worker.fetch(eventsReq, env);
    expect(mockEventsService.fetch).toHaveBeenCalledWith(eventsReq);
    expect(resEvents.status).toBe(200);
  });

  it("serves static assets from env.ASSETS binding for non-API routes", async () => {
    const mockAssets = {
      fetch: vi.fn().mockResolvedValue(
        new Response("<!DOCTYPE html><html><body>SightForge</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    };

    const req = new Request(
      "https://sightforge-web-prod.test.workers.dev/jobs",
    );
    const res = await worker.fetch(req, { ASSETS: mockAssets });

    expect(mockAssets.fetch).toHaveBeenCalledWith(req);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("SightForge");
  });

  it("responds with static assets placeholder when ASSETS binding is missing", async () => {
    const req = new Request("http://localhost/");
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("SightForge Web");
  });
});
