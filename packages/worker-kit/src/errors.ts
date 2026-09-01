/**
 * @sightforge/worker-kit - Error Envelopes & Reason Codes
 *
 * Implements closed error reason codes conforming to KTD14 and R72.
 */

export type ErrorReasonCode =
  | "quota-exhausted"
  | "spend-ceiling"
  | "counter-unavailable"
  | "rate-limit-exceeded"
  | "size"
  | "format"
  | "duration"
  | "codec-unsupported"
  | "source-changed"
  | "timeout"
  | "inference-error"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "invalid-input"
  | "conflict"
  | "unsupported-media-type"
  | "internal-error";

export interface ErrorEnvelope {
  error: {
    code: ErrorReasonCode | string;
    message: string;
    details?: unknown;
  };
}

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: ErrorReasonCode | string;
  public readonly details?: unknown;
  public readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: ErrorReasonCode | string,
    message: string,
    details?: unknown,
    headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

/**
 * Creates a structured JSON error response complying with R72.
 */
export function createErrorResponse(
  error: unknown,
  defaultStatus = 500,
  defaultCode: ErrorReasonCode = "internal-error",
  extraHeaders: Record<string, string> = {},
): Response {
  let status = defaultStatus;
  let code = defaultCode;
  let message = "An internal server error occurred.";
  let details: unknown = undefined;
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  };

  if (error instanceof HttpError) {
    status = error.status;
    code = error.code as ErrorReasonCode;
    message = error.message;
    details = error.details;
    if (error.headers) {
      Object.assign(headers, error.headers);
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  const payload: ErrorEnvelope = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };

  return new Response(JSON.stringify(payload), {
    status,
    headers,
  });
}
