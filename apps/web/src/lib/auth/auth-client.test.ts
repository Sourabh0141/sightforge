import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthClient } from "./auth-client";
import { ApiClient } from "../api-client";
import { DEFAULT_ARGON2_PARAMS } from "./types";

describe("AuthClient End-to-End Orchestration (P4 U2, R5, R6, R9, R10)", () => {
  let apiClient: ApiClient;
  let authClient: AuthClient;

  beforeEach(() => {
    apiClient = new ApiClient("https://api.sightforge.dev");
    authClient = new AuthClient(apiClient);
  });

  it("queries GET /auth/salt with normalized lowercase email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        clientSalt: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
        argon2Params: DEFAULT_ARGON2_PARAMS,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const saltData = await authClient.getSalt("USER@Example.COM");
    expect(saltData.clientSalt).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.sightforge.dev/auth/salt?email=user%40example.com",
    );

    vi.unstubAllGlobals();
  });

  it("completes full register flow without sending plaintext password (R5)", async () => {
    let registrationPayload: Record<string, unknown> | null = null;

    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/auth/salt")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              clientSalt: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
              argon2Params: DEFAULT_ARGON2_PARAMS,
            }),
          };
        }

        if (url.includes("/auth/register")) {
          registrationPayload = JSON.parse(String(init?.body || "{}"));
          return {
            ok: true,
            status: 201,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              user: {
                id: "user-1234",
                email: "newuser@example.com",
              },
            }),
          };
        }

        return { ok: false, status: 404 };
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await authClient.register({
      email: "newuser@example.com",
      password: "super-secret-password-12345",
      turnstileToken: "mock-turnstile-token",
    });

    expect(result.user.id).toBe("user-1234");
    expect(registrationPayload).toBeDefined();

    const payload = registrationPayload as unknown as {
      email: string;
      clientDerivedKey: string;
      clientSalt: string;
      passwordLength: number;
      turnstileToken: string;
      password?: string;
    };

    expect(payload.email).toBe("newuser@example.com");
    expect(payload.clientSalt).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
    expect(payload.passwordLength).toBe(27);
    expect(payload.turnstileToken).toBe("mock-turnstile-token");
    expect(payload.clientDerivedKey.length).toBe(64);
    expect(payload.password).toBeUndefined(); // Plaintext password NEVER in payload (R5)

    vi.unstubAllGlobals();
  });

  it("completes full login flow (R5, R6)", async () => {
    let loginPayload: Record<string, unknown> | null = null;

    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/auth/salt")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              clientSalt: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
              argon2Params: DEFAULT_ARGON2_PARAMS,
            }),
          };
        }

        if (url.includes("/auth/login")) {
          loginPayload = JSON.parse(String(init?.body || "{}"));
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              user: {
                id: "user-1234",
                email: "existing@example.com",
              },
            }),
          };
        }

        return { ok: false, status: 404 };
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await authClient.login({
      email: "existing@example.com",
      password: "super-secret-password-12345",
      turnstileToken: "mock-turnstile-token",
    });

    expect(result.user.email).toBe("existing@example.com");
    const payload = loginPayload as unknown as {
      email: string;
      clientDerivedKey: string;
      turnstileToken: string;
      password?: string;
    };
    expect(payload.clientDerivedKey.length).toBe(64);
    expect(payload.password).toBeUndefined(); // Plaintext password NEVER in payload (R5)

    vi.unstubAllGlobals();
  });

  it("handles getMe and logout cleanly", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/auth/me")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            user: {
              id: "user-1234",
              email: "active@example.com",
            },
          }),
        };
      }
      if (url.includes("/auth/logout")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ success: true }),
        };
      }
      return { ok: false, status: 404 };
    });

    vi.stubGlobal("fetch", fetchMock);

    const user = await authClient.getMe();
    expect(user?.email).toBe("active@example.com");

    await expect(authClient.logout()).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });
});
