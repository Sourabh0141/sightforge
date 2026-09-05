import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiError } from "./api-client";

describe("Centralized API Client (P4 U1, R53, R68)", () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient("https://api.sightforge.dev");
  });

  it("attaches X-SightForge-Request and credentials to all requests (R68)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.get("/jobs");
    expect(result).toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sightforge.dev/jobs");
    expect(init.credentials).toBe("include");

    const headers = init.headers as Headers;
    expect(headers.get("X-SightForge-Request")).toBe("1");

    vi.unstubAllGlobals();
  });

  it("parses structured error responses into ApiError instances", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        error: {
          code: "size",
          message: "File exceeds 10MB limit",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.post("/jobs", { size: 99999999 })).rejects.toThrowError(
      ApiError,
    );

    try {
      await client.post("/jobs", { size: 99999999 });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe("size");
      expect(apiErr.descriptor.title).toBe("File too large");
    }

    vi.unstubAllGlobals();
  });
});
