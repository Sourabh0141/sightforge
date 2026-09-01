/**
 * @sightforge/worker-kit - Row Ownership Verification Helper
 *
 * Enforces handler-level authorization against resolved database rows per KTD3 and R13.
 */

import { HttpError } from "./errors.js";

/**
 * Asserts that the authenticated user owns the resolved database resource.
 * Emits an opaque 404 / not-found to prevent resource enumeration attacks.
 */
export function assertOwnership<
  T extends { userId?: string; user_id?: string },
>(
  userId: string,
  resource: T | null | undefined,
  customMessage = "The requested resource was not found.",
): asserts resource is T {
  if (!resource) {
    throw new HttpError(404, "not-found", customMessage);
  }

  const ownerId = resource.userId ?? resource.user_id;
  if (!ownerId || ownerId !== userId) {
    throw new HttpError(404, "not-found", customMessage);
  }
}
