/**
 * SightForge Web - Authentication API Client (R5, R6, R9, R10, R56)
 *
 * Coordinates anti-enumeration salt lookup, client-side Argon2id derivation,
 * registration, login, token refresh, and logout.
 */

import { ApiClient, api, ApiError } from "../api-client";
import { deriveClientKey } from "./derivation";
import type { AuthResponse, SaltResponse, User } from "./types";

export interface RegisterInput {
  email: string;
  password: string;
  turnstileToken?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  turnstileToken?: string;
}

export class AuthClient {
  private client: ApiClient;

  constructor(client: ApiClient = api) {
    this.client = client;
  }

  /**
   * Retrieves actual or pseudo-salt and Argon2 parameters in constant time (R6, AE1).
   */
  async getSalt(email: string): Promise<SaltResponse> {
    const encoded = encodeURIComponent(email.trim().toLowerCase());
    return this.client.get<SaltResponse>(`/auth/salt?email=${encoded}`);
  }

  /**
   * Registers a new account:
   * 1. Fetches salt and parameters (or uses default parameters)
   * 2. Derives client key in browser Web Worker using Argon2id (R5, KTD6)
   * 3. Submits derived key, client salt, and password length (R5, R7, R11)
   */
  async register(input: RegisterInput): Promise<AuthResponse> {
    const email = input.email.trim().toLowerCase();
    const password = input.password;

    // 1. Salt lookup (unregistered email receives deterministic pseudo-salt)
    const saltData = await this.getSalt(email);

    // 2. Client-side derivation (plaintext password never leaves this scope)
    const clientDerivedKey = await deriveClientKey(
      password,
      saltData.clientSalt,
      saltData.argon2Params,
    );

    // 3. Register account
    const response = await this.client.post<AuthResponse>("/auth/register", {
      email,
      clientDerivedKey,
      clientSalt: saltData.clientSalt,
      passwordLength: password.length,
      turnstileToken: input.turnstileToken,
      argon2Params: saltData.argon2Params,
    });

    return response;
  }

  /**
   * Logs into an existing account:
   * 1. Fetches user salt and parameters
   * 2. Derives client key in browser Web Worker using Argon2id (R5, KTD6)
   * 3. Submits derived key for server verification (R6, R8)
   */
  async login(input: LoginInput): Promise<AuthResponse> {
    const email = input.email.trim().toLowerCase();
    const password = input.password;

    // 1. Salt lookup
    const saltData = await this.getSalt(email);

    // 2. Client-side derivation
    const clientDerivedKey = await deriveClientKey(
      password,
      saltData.clientSalt,
      saltData.argon2Params,
    );

    // 3. Submit login
    const response = await this.client.post<AuthResponse>("/auth/login", {
      email,
      clientDerivedKey,
      turnstileToken: input.turnstileToken,
    });

    return response;
  }

  /**
   * Refreshes the session using the HttpOnly refresh token cookie (R9, KTD8).
   */
  async refreshSession(): Promise<User | null> {
    try {
      const response = await this.client.post<AuthResponse>(
        "/auth/refresh",
        {},
      );
      return response.user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Checks the current authenticated session status via GET /auth/me.
   */
  async getMe(): Promise<User | null> {
    try {
      const response = await this.client.get<{ user: User }>("/auth/me");
      return response.user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return null;
      }
      return null;
    }
  }

  /**
   * Logs out the user, revoking the token family and clearing session cookies (R9, R10).
   */
  async logout(): Promise<void> {
    try {
      await this.client.post<{ success: boolean }>("/auth/logout", {});
    } catch {
      // Best-effort logout cleanup
    }
  }
}

export const authClient = new AuthClient();
