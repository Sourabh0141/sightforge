/**
 * @sightforge/worker-kit - Structured Logging & Sensitive Data Redaction
 *
 * Implements field-level redaction and correlation ID tracking per KTD10 and R109.
 */

const REDACTED_FIELD_NAMES = new Set([
  "password",
  "clientderivedkey",
  "client_derived_key",
  "derivedkey",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "socketticket",
  "socket_ticket",
  "ticket",
  "secret",
  "authorization",
  "cookie",
  "jwt_secret",
  "turnstile_secret_key",
  "password_pepper",
  "password_salt_key",
  "r2_media_secret_access_key",
  "modal_token_secret",
  "inference_callback_secret",
]);

/**
 * Deeply sanitizes any object or array, replacing sensitive fields with "[REDACTED]".
 */
export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");
    if (
      REDACTED_FIELD_NAMES.has(normalizedKey) ||
      REDACTED_FIELD_NAMES.has(key.toLowerCase())
    ) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = redactSensitiveData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export interface LogEntry {
  level: "info" | "warn" | "error" | "debug";
  message: string;
  correlationId?: string;
  timestamp: string;
  service?: string;
  metadata?: Record<string, unknown>;
}

export class Logger {
  constructor(
    private readonly service = "sightforge",
    private readonly correlationId?: string,
  ) {}

  public info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  public warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }

  public error(message: string, metadata?: Record<string, unknown>): void {
    this.log("error", message, metadata);
  }

  public debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, metadata);
  }

  private log(
    level: "info" | "warn" | "error" | "debug",
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      level,
      message,
      service: this.service,
      timestamp: new Date().toISOString(),
      ...(this.correlationId ? { correlationId: this.correlationId } : {}),
      ...(metadata
        ? { metadata: redactSensitiveData(metadata) as Record<string, unknown> }
        : {}),
    };
    console.log(JSON.stringify(entry));
  }
}
