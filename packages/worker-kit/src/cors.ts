/**
 * @sightforge/worker-kit - CORS & Origin Allow-List Middleware
 *
 * Implements origin allow-list validation and preflight handling per R67.
 */

export const DEFAULT_ORIGIN = "https://sightforge.app";

export const DEFAULT_ALLOWED_ORIGINS: string[] = [
  "https://sightforge.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

export interface CorsOptions {
  allowedOrigins?: string[];
  allowCredentials?: boolean;
  allowedMethods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAgeSeconds?: number;
}

/**
 * Validates whether an origin is permitted by the allow-list.
 */
export function isOriginAllowed(
  origin: string | null,
  allowedOrigins: string[] = DEFAULT_ALLOWED_ORIGINS,
): boolean {
  if (!origin) {
    return false;
  }
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  try {
    const url = new URL(origin);
    if (
      url.hostname.endsWith(".workers.dev") ||
      url.hostname === "sightforge.app" ||
      url.hostname.endsWith(".sightforge.app") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Handles CORS preflight OPTIONS request and attaches CORS headers.
 */
export function handleCors(
  request: Request,
  options: CorsOptions = {},
): Response | null {
  const origin = request.headers.get("Origin");
  const allowedOrigins = options.allowedOrigins || DEFAULT_ALLOWED_ORIGINS;
  const isAllowed = isOriginAllowed(origin, allowedOrigins);

  const matchedOrigin: string =
    (isAllowed && origin ? origin : allowedOrigins[0]) ?? DEFAULT_ORIGIN;
  const allowCredentials = options.allowCredentials ?? true;
  const allowedMethods = options.allowedMethods || [
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
    "OPTIONS",
  ];
  const allowedHeaders = options.allowedHeaders || [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-SightForge-Request",
    "Idempotency-Key",
    "Sec-Fetch-Site",
    "Sec-Fetch-Mode",
    "Sec-Fetch-Dest",
  ];
  const exposedHeaders = options.exposedHeaders || [
    "ETag",
    "Content-Length",
    "Content-Type",
    "Retry-After",
  ];
  const maxAgeSeconds = options.maxAgeSeconds ?? 86400;

  if (request.method === "OPTIONS") {
    if (!isAllowed) {
      return new Response(null, { status: 403 });
    }

    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", matchedOrigin);
    headers.set("Access-Control-Allow-Methods", allowedMethods.join(", "));
    headers.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));
    headers.set("Access-Control-Expose-Headers", exposedHeaders.join(", "));
    headers.set("Access-Control-Max-Age", maxAgeSeconds.toString());
    if (allowCredentials) {
      headers.set("Access-Control-Allow-Credentials", "true");
    }

    return new Response(null, {
      status: 204,
      headers,
    });
  }

  return null;
}

/**
 * Attaches CORS headers to a response.
 */
export function appendCorsHeaders(
  response: Response,
  origin: string | null,
  options: CorsOptions = {},
): Response {
  const allowedOrigins = options.allowedOrigins || DEFAULT_ALLOWED_ORIGINS;
  const isAllowed = isOriginAllowed(origin, allowedOrigins);
  if (!isAllowed || !origin) {
    return response;
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", origin);
  if (options.allowCredentials ?? true) {
    newHeaders.set("Access-Control-Allow-Credentials", "true");
  }
  const exposedHeaders = options.exposedHeaders || [
    "ETag",
    "Content-Length",
    "Content-Type",
    "Retry-After",
  ];
  newHeaders.set("Access-Control-Expose-Headers", exposedHeaders.join(", "));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
