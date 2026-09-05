/**
 * sightforge-web Worker entrypoint
 *
 * Serves static Next.js export assets from the ASSETS binding (with SPA fallback),
 * and automatically reverse-proxies API requests (/auth/*, /jobs/*, /events/*)
 * to sibling Cloudflare Workers when deployed on *.workers.dev or configured via environment variables.
 */

export interface WebWorkerEnv {
  ASSETS?: {
    fetch(request: Request | string): Promise<Response>;
  };
  ENVIRONMENT?: string;
  AUTH_SERVICE_URL?: string;
  JOBS_SERVICE_URL?: string;
  EVENTS_SERVICE_URL?: string;
  AUTH_SERVICE?: { fetch(request: Request): Promise<Response> };
  JOBS_SERVICE?: { fetch(request: Request): Promise<Response> };
  EVENTS_SERVICE?: { fetch(request: Request): Promise<Response> };
}

export function extractSubdomain(hostname: string): string | null {
  if (hostname.endsWith(".workers.dev")) {
    const parts = hostname.split(".");
    if (parts.length >= 3) {
      return parts[parts.length - 3] ?? null;
    }
  }
  return null;
}

export function isApiRoute(pathname: string, request: Request): boolean {
  if (pathname.startsWith("/auth")) {
    return true;
  }
  if (pathname.startsWith("/events") || pathname.startsWith("/callbacks")) {
    return true;
  }
  if (pathname === "/account") {
    return true;
  }
  if (pathname.startsWith("/jobs/")) {
    return true;
  }
  if (pathname === "/jobs") {
    // Non-GET requests (e.g. POST /jobs) are API calls
    if (request.method !== "GET" && request.method !== "HEAD") {
      return true;
    }
    // GET /jobs with API request header or JSON accept header
    if (
      request.headers.get("X-SightForge-Request") === "1" ||
      request.headers.get("accept")?.includes("application/json")
    ) {
      return true;
    }
  }
  return false;
}

export function proxyRequest(
  request: Request,
  targetHost: string,
  pathname: string,
  search: string,
): Promise<Response> {
  const targetUrl = `${targetHost}${pathname}${search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");

  const reqInit: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    reqInit.body = request.body;
    // @ts-expect-error duplex required for streaming body in worker fetch
    reqInit.duplex = "half";
  }
  return fetch(targetUrl, reqInit);
}

export default {
  async fetch(request: Request, env?: WebWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 1. Health probe route
    if (pathname === "/health" || pathname === "/health/") {
      return new Response(
        JSON.stringify({
          status: "ready",
          service: "sightforge-web",
          environment: env?.ENVIRONMENT || "prod",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // 2. Reverse proxy API traffic to sibling microservice workers if needed
    if (isApiRoute(pathname, request)) {
      const subdomain = extractSubdomain(url.hostname);

      if (pathname.startsWith("/auth")) {
        if (env?.AUTH_SERVICE) {
          return env.AUTH_SERVICE.fetch(request);
        }
        const targetHost =
          env?.AUTH_SERVICE_URL?.replace(/\/$/, "") ||
          (subdomain
            ? `https://sightforge-api-auth-prod.${subdomain}.workers.dev`
            : null);
        if (targetHost) {
          return proxyRequest(request, targetHost, pathname, url.search);
        }
      }

      if (pathname.startsWith("/jobs") || pathname === "/account") {
        if (env?.JOBS_SERVICE) {
          return env.JOBS_SERVICE.fetch(request);
        }
        const targetHost =
          env?.JOBS_SERVICE_URL?.replace(/\/$/, "") ||
          (subdomain
            ? `https://sightforge-api-jobs-prod.${subdomain}.workers.dev`
            : null);
        if (targetHost) {
          return proxyRequest(request, targetHost, pathname, url.search);
        }
      }

      if (pathname.startsWith("/events") || pathname.startsWith("/callbacks")) {
        if (env?.EVENTS_SERVICE) {
          return env.EVENTS_SERVICE.fetch(request);
        }
        const targetHost =
          env?.EVENTS_SERVICE_URL?.replace(/\/$/, "") ||
          (subdomain
            ? `https://sightforge-events-prod.${subdomain}.workers.dev`
            : null);
        if (targetHost) {
          return proxyRequest(request, targetHost, pathname, url.search);
        }
      }
    }

    // 3. Static Assets & SPA Fallback
    if (env?.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("SightForge Web Static Assets Placeholder", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
