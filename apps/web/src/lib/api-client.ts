/**
 * SightForge Centralized API Client (P4 U1, R4, R53, R68)
 *
 * The single gateway for all API traffic from the static frontend to Cloudflare Workers.
 * Enforces custom security headers, credentials inclusion, and automatic capacity probing.
 */

import { getErrorDescriptor, type ErrorDescriptor } from "./errors";
import { probeCapacityState } from "./capacity";

export interface ApiClientOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly descriptor: ErrorDescriptor;
  public readonly details?: unknown;

  constructor(status: number, code: string, details?: unknown) {
    const descriptor = getErrorDescriptor(code);
    super(descriptor.message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.descriptor = descriptor;
    this.details = details;
  }
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.NEXT_PUBLIC_API_URL || "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Executes a fetch request against the Edge API.
   */
  public async request<T = unknown>(
    path: string,
    options: ApiClientOptions = {},
  ): Promise<T> {
    const { params, headers: customHeaders, ...fetchInit } = options;

    // Build URL with query parameters
    let url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined) {
          searchParams.append(key, String(val));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += `${url.includes("?") ? "&" : "?"}${qs}`;
      }
    }

    // Prepare headers with cross-site request defense (R68)
    const headers = new Headers(customHeaders);
    headers.set("X-SightForge-Request", "1");
    if (
      fetchInit.body &&
      typeof fetchInit.body === "string" &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json; charset=utf-8");
    }

    try {
      const response = await fetch(url, {
        ...fetchInit,
        headers,
        credentials: "include", // Required for cookie authentication across workers
      });

      // Handle successful responses
      if (response.ok) {
        if (response.status === 204) {
          return undefined as unknown as T;
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return (await response.json()) as T;
        }
        return (await response.text()) as unknown as T;
      }

      // Handle structured API errors
      let errorCode = "internal-error";
      let errorDetails: unknown = undefined;

      try {
        const errorJson = await response.json();
        if (
          errorJson &&
          typeof errorJson === "object" &&
          "error" in errorJson
        ) {
          errorCode = errorJson.error.code || errorCode;
          errorDetails = errorJson.error.details;
        }
      } catch {
        // Fallback for non-JSON error bodies
        if (response.status === 401) errorCode = "unauthorized";
        else if (response.status === 403) errorCode = "forbidden";
        else if (response.status === 404) errorCode = "not-found";
        else if (response.status === 429) errorCode = "quota-exhausted";
        else if (response.status >= 500) errorCode = "internal-error";
      }

      throw new ApiError(response.status, errorCode, errorDetails);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }

      // Opaque fetch error (e.g. TypeError "Failed to fetch")
      // Probe whether it's capacity exhaustion (R4) or true offline network
      const capacityState = await probeCapacityState();
      if (capacityState.isExhausted) {
        throw new ApiError(503, "spend-ceiling", {
          resetsAt: capacityState.resetsAt,
          countdown: capacityState.resetCountdown,
        });
      }

      throw new ApiError(0, "offline", err);
    }
  }

  public get<T = unknown>(
    path: string,
    options?: ApiClientOptions,
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  public post<T = unknown>(
    path: string,
    body?: unknown,
    options?: ApiClientOptions,
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "POST",
      body:
        body !== undefined
          ? typeof body === "string"
            ? body
            : JSON.stringify(body)
          : undefined,
    });
  }

  public put<T = unknown>(
    path: string,
    body?: unknown,
    options?: ApiClientOptions,
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "PUT",
      body:
        body !== undefined
          ? typeof body === "string"
            ? body
            : JSON.stringify(body)
          : undefined,
    });
  }

  public delete<T = unknown>(
    path: string,
    options?: ApiClientOptions,
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }
}

export const api = new ApiClient();
