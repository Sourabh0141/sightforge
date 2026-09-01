/**
 * @sightforge/worker-kit - Universal Security Headers Middleware
 *
 * Enforces mandatory security headers across all API and HTML response paths (R110).
 */

export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none';",
};

/**
 * Appends standard security headers to an existing Response object.
 */
export function applySecurityHeaders(
  response: Response,
  customCSP?: string,
): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }
  if (customCSP) {
    newHeaders.set("Content-Security-Policy", customCSP);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
