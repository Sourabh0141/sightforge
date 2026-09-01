/**
 * @sightforge/worker-kit - CSRF Defense & Fetch Metadata Validation
 *
 * Enforces custom header requirement and Sec-Fetch-Site cross-site defense
 * on all state-changing mutation endpoints per R68 and R69.
 */

import { HttpError } from "./errors.js";
import { isOriginAllowed, DEFAULT_ALLOWED_ORIGINS } from "./cors.js";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/**
 * Asserts that the request satisfies CSRF protections.
 * Throws HttpError(403) on violation.
 */
export function assertCsrf(
  request: Request,
  allowedOrigins: string[] = DEFAULT_ALLOWED_ORIGINS,
): void {
  // Safe read methods (GET, HEAD, OPTIONS) do not require custom CSRF headers
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
    return;
  }

  // 1. Enforce custom header requirement (R68)
  const customHeader =
    request.headers.get("X-SightForge-Request") ||
    request.headers.get("X-Requested-With");

  if (!customHeader) {
    throw new HttpError(
      403,
      "forbidden",
      "Missing required custom CSRF defense header (X-SightForge-Request).",
    );
  }

  // 2. Enforce Sec-Fetch-Site metadata (R68)
  const secFetchSite = request.headers.get("Sec-Fetch-Site");
  if (secFetchSite) {
    if (secFetchSite === "cross-site") {
      throw new HttpError(
        403,
        "forbidden",
        "Cross-site state-changing requests are prohibited.",
      );
    }
    // "same-origin", "same-site", or "none" are accepted
    return;
  }

  // 3. Fallback when Sec-Fetch-Site is absent (older clients / curl): Validate Origin or Referer
  const origin = request.headers.get("Origin");
  if (origin) {
    if (!isOriginAllowed(origin, allowedOrigins)) {
      throw new HttpError(
        403,
        "forbidden",
        "Origin is not permitted to perform state-changing operations.",
      );
    }
    return;
  }

  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!isOriginAllowed(refererOrigin, allowedOrigins)) {
        throw new HttpError(
          403,
          "forbidden",
          "Referer origin is not permitted.",
        );
      }
      return;
    } catch {
      throw new HttpError(403, "forbidden", "Malformed Referer header.");
    }
  }

  // If no Sec-Fetch-Site, Origin, or Referer is present on mutation, refuse (fail-closed per R68)
  throw new HttpError(
    403,
    "forbidden",
    "Missing fetch origin metadata on state-changing request.",
  );
}
