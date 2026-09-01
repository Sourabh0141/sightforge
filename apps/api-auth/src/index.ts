/**
 * @sightforge/api-auth - Authentication Worker Entrypoint
 *
 * Implements registration, login, refresh token rotation, session family revocation,
 * anti-enumeration salt lookup, and account-level rate limiting (R5-R15, R71, R109).
 */

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { refreshTokens, users } from "@sightforge/db";
import {
  authenticatedChain,
  AuthWorkerEnv,
  createErrorResponse,
  getClientIpPrefix,
  HttpError,
  RequestContext,
  signJwt,
  timingSafeEqual,
  unauthenticatedChain,
} from "@sightforge/worker-kit";
import { assertEmail } from "./canonical.js";
import {
  assertPasswordPolicy,
  computeServerFastHash,
  DEFAULT_ARGON2_PARAMS,
  derivePseudoSalt,
  generateRandomSaltHex,
} from "./passwords.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  buildLogoutCookieHeaders,
  buildSessionCookieHeaders,
  createRefreshTokenFamily,
  extractRefreshTokenFromRequest,
  REFRESH_TOKEN_TTL_SECONDS,
  revokeTokenFamily,
  sha256Hex,
} from "./sessions.js";
import { verifyTurnstileToken } from "./turnstile.js";

const AUTH_LOCKOUT_MAX_ATTEMPTS = 5;
const AUTH_LOCKOUT_WINDOW_SECONDS = 900; // 15 minutes (config/defaults.json)

/**
 * Main Worker export handling all authentication endpoints.
 */
export default {
  async fetch(request: Request, env: AuthWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Health check endpoint
    if ((path === "/" || path === "/health") && method === "GET") {
      return new Response(
        JSON.stringify({ service: "sightforge-api-auth", status: "ready" }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Unauthenticated chain for public auth endpoints
    if (path.startsWith("/auth/")) {
      if (path === "/auth/salt" && method === "GET") {
        return unauthenticatedChain(request, env, async (ctx) =>
          handleSaltLookup(ctx, env),
        );
      }

      if (path === "/auth/register" && method === "POST") {
        return unauthenticatedChain(request, env, async (ctx) =>
          handleRegister(ctx, env),
        );
      }

      if (path === "/auth/login" && method === "POST") {
        return unauthenticatedChain(request, env, async (ctx) =>
          handleLogin(ctx, env),
        );
      }

      if (path === "/auth/refresh" && method === "POST") {
        return unauthenticatedChain(request, env, async (ctx) =>
          handleRefresh(ctx, env),
        );
      }

      if (path === "/auth/logout" && method === "POST") {
        return unauthenticatedChain(request, env, async (ctx) =>
          handleLogout(ctx, env),
        );
      }

      // Authenticated current user profile check
      if (path === "/auth/me" && method === "GET") {
        return authenticatedChain(request, env, async (ctx) =>
          handleGetMe(ctx, env),
        );
      }
    }

    return createErrorResponse(
      new HttpError(404, "not-found", `Endpoint not found: ${method} ${path}`),
    );
  },
};

/**
 * GET /auth/salt?email=...
 * Returns actual or pseudo-salt and Argon2 parameters in constant time (R6, AE1).
 */
async function handleSaltLookup(
  ctx: RequestContext,
  env: AuthWorkerEnv,
): Promise<Response> {
  const url = new URL(ctx.request.url);
  const rawEmail = url.searchParams.get("email");
  const canonicalEmail = assertEmail(rawEmail);

  const db = drizzle(env.DB);
  const foundUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, canonicalEmail))
    .limit(1);

  const user = foundUsers[0];

  if (user) {
    // Registered account path: return stored client salt and recorded Argon2 params
    return Response.json(
      {
        clientSalt: user.clientSalt,
        argon2Params: {
          memoryKiB: user.argon2MemoryKib,
          iterations: user.argon2Iterations,
          parallelism: user.argon2Parallelism,
          version: user.argon2Version,
        },
      },
      { status: 200 },
    );
  }

  // Unregistered account path: compute deterministic pseudo-salt in constant time (R6, AE1)
  const pseudoSalt = await derivePseudoSalt(
    canonicalEmail,
    env.PASSWORD_SALT_KEY || env.PASSWORD_PEPPER,
  );

  return Response.json(
    {
      clientSalt: pseudoSalt,
      argon2Params: DEFAULT_ARGON2_PARAMS,
    },
    { status: 200 },
  );
}

/**
 * POST /auth/register
 * Validates credentials, creates user with server salt/hash, and seeds session (R5, R7, R10, R11, R71).
 */
async function handleRegister(
  ctx: RequestContext,
  env: AuthWorkerEnv,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid-input", "Malformed JSON request body.");
  }

  const email = assertEmail(body.email);
  const clientDerivedKey = String(body.clientDerivedKey || "");
  const clientSalt = String(body.clientSalt || "");
  const passwordLength =
    typeof body.passwordLength === "number" ? body.passwordLength : undefined;
  const turnstileToken = body.turnstileToken;

  assertPasswordPolicy(passwordLength, clientDerivedKey);

  if (!clientSalt || clientSalt.length < 16) {
    throw new HttpError(400, "invalid-input", "Client salt is required.");
  }

  const clientIp = getClientIpPrefix(ctx.request);
  await verifyTurnstileToken(
    turnstileToken,
    clientIp,
    env.TURNSTILE_SECRET_KEY,
    env.ENVIRONMENT === "test",
  );

  const db = drizzle(env.DB);
  const existingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUsers.length > 0) {
    throw new HttpError(
      409,
      "invalid-input",
      "An account with this email address is already registered.",
    );
  }

  const userId = crypto.randomUUID();
  const serverSalt = generateRandomSaltHex(16);
  const passwordHash = await computeServerFastHash(
    clientDerivedKey,
    serverSalt,
    env.PASSWORD_PEPPER,
  );

  const now = new Date();
  const argon2Params =
    (body.argon2Params as Record<string, unknown>) || DEFAULT_ARGON2_PARAMS;

  await db.insert(users).values({
    id: userId,
    email,
    clientSalt,
    argon2MemoryKib: Number(
      argon2Params.memoryKiB || DEFAULT_ARGON2_PARAMS.memoryKiB,
    ),
    argon2Iterations: Number(
      argon2Params.iterations || DEFAULT_ARGON2_PARAMS.iterations,
    ),
    argon2Parallelism: Number(
      argon2Params.parallelism || DEFAULT_ARGON2_PARAMS.parallelism,
    ),
    argon2Version: String(
      argon2Params.version || DEFAULT_ARGON2_PARAMS.version,
    ),
    serverSalt,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  });

  // Seed session with new refresh token family
  const { rawToken: refreshToken } = await createRefreshTokenFamily(
    env.DB,
    userId,
  );

  const jwtSecret = env.JWT_SECRET || "sightforge-jwt-secret-key-default";
  const accessToken = await signJwt(
    {
      sub: userId,
      email,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
    },
    jwtSecret,
  );

  const isSecure = env.ENVIRONMENT !== "test";
  const cookieHeaders = buildSessionCookieHeaders(accessToken, refreshToken, {
    isSecure,
  });

  const headers = new Headers({
    "Content-Type": "application/json",
  });
  for (const cookie of cookieHeaders) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(
    JSON.stringify({
      user: {
        id: userId,
        email,
      },
    }),
    {
      status: 201,
      headers,
    },
  );
}

/**
 * POST /auth/login
 * Validates credentials, enforces account lockout, and issues session cookies (R6, R8, R9, R14, R74).
 */
async function handleLogin(
  ctx: RequestContext,
  env: AuthWorkerEnv,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid-input", "Malformed JSON request body.");
  }

  const email = assertEmail(body.email);
  const clientDerivedKey = String(body.clientDerivedKey || "");
  const turnstileToken = body.turnstileToken;

  assertPasswordPolicy(undefined, clientDerivedKey);

  const clientIp = getClientIpPrefix(ctx.request);

  // Check account lockout via Counter Durable Object (R14)
  if (env.COUNTER) {
    try {
      const id = env.COUNTER.idFromName("global");
      const stub = env.COUNTER.get(id);
      const res = await stub.fetch("http://counter/rate-limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `auth:account:${email}`,
          policy: "account-lockout",
          limit: AUTH_LOCKOUT_MAX_ATTEMPTS,
          windowSeconds: AUTH_LOCKOUT_WINDOW_SECONDS,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          allowed: boolean;
          remaining: number;
        };
        if (!data.allowed && data.remaining === 0) {
          throw new HttpError(
            429,
            "account-locked",
            "Account is temporarily locked due to excessive failed attempts. Please try again later.",
          );
        }
      }
    } catch (err) {
      if (err instanceof HttpError) {
        throw err;
      }
    }
  }

  await verifyTurnstileToken(
    turnstileToken,
    clientIp,
    env.TURNSTILE_SECRET_KEY,
    env.ENVIRONMENT === "test",
  );

  const db = drizzle(env.DB);
  const foundUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user = foundUsers[0];

  if (!user) {
    // Constant-time dummy computation for unregistered user
    await computeServerFastHash(
      clientDerivedKey,
      "dummy-server-salt",
      env.PASSWORD_PEPPER,
    );
    throw new HttpError(
      401,
      "invalid-credentials",
      "Invalid email or password.",
    );
  }

  const computedHash = await computeServerFastHash(
    clientDerivedKey,
    user.serverSalt,
    env.PASSWORD_PEPPER,
  );

  const isValidPassword = timingSafeEqual(
    new TextEncoder().encode(computedHash),
    new TextEncoder().encode(user.passwordHash),
  );

  if (!isValidPassword) {
    throw new HttpError(
      401,
      "invalid-credentials",
      "Invalid email or password.",
    );
  }

  // Seed new refresh token family for this login session
  const { rawToken: refreshToken } = await createRefreshTokenFamily(
    env.DB,
    user.id,
  );

  const jwtSecret = env.JWT_SECRET || "sightforge-jwt-secret-key-default";
  const accessToken = await signJwt(
    {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
    },
    jwtSecret,
  );

  const isSecure = env.ENVIRONMENT !== "test";
  const cookieHeaders = buildSessionCookieHeaders(accessToken, refreshToken, {
    isSecure,
  });

  const headers = new Headers({
    "Content-Type": "application/json",
  });
  for (const cookie of cookieHeaders) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(
    JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
      },
    }),
    {
      status: 200,
      headers,
    },
  );
}

/**
 * POST /auth/refresh
 * Implements single-use token rotation and family revocation on reuse (R9, KTD8, AE6).
 */
async function handleRefresh(
  ctx: RequestContext,
  env: AuthWorkerEnv,
): Promise<Response> {
  const refreshToken = extractRefreshTokenFromRequest(ctx.request);
  if (!refreshToken) {
    throw new HttpError(401, "unauthorized", "Refresh token is required.");
  }

  const hashedToken = await sha256Hex(refreshToken);
  const db = drizzle(env.DB);

  const tokenRows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.hashedToken, hashedToken))
    .limit(1);

  const tokenRow = tokenRows[0];
  if (!tokenRow) {
    throw new HttpError(
      401,
      "unauthorized",
      "Invalid or expired refresh token.",
    );
  }

  // Reuse Detection: If token is already consumed, revoke the entire family (R9, KTD8, AE6)
  if (tokenRow.isConsumed) {
    await revokeTokenFamily(env.DB, tokenRow.familyId);
    const logoutCookies = buildLogoutCookieHeaders({
      isSecure: env.ENVIRONMENT !== "test",
    });
    const headers = new Headers({ "Content-Type": "application/json" });
    for (const cookie of logoutCookies) {
      headers.append("Set-Cookie", cookie);
    }
    throw new HttpError(
      401,
      "session-revoked",
      "Refresh token reuse detected. All sessions in this family have been revoked.",
    );
  }

  // Absolute Expiry and token expiry validation
  const now = new Date();
  if (
    tokenRow.expiresAt.getTime() <= now.getTime() ||
    tokenRow.familyExpiresAt.getTime() <= now.getTime()
  ) {
    await revokeTokenFamily(env.DB, tokenRow.familyId);
    throw new HttpError(
      401,
      "unauthorized",
      "Session has expired. Please sign in again.",
    );
  }

  // Query user to get email for JWT
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, tokenRow.userId))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    throw new HttpError(401, "unauthorized", "User account not found.");
  }

  // Single D1 atomic batch: consume old token + insert new rotated token (R26)
  const { rawToken: newRawToken, hashedToken: newHashedToken } =
    await (async () => {
      const raw = generateRandomSaltHex(32);
      const hashed = await sha256Hex(raw);
      return { rawToken: raw, hashedToken: hashed };
    })();

  const newExpiresAt = new Date(
    now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000,
  );

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE refresh_tokens SET is_consumed = 1 WHERE id = ?",
    ).bind(tokenRow.id),
    env.DB.prepare(
      "INSERT INTO refresh_tokens (id, user_id, hashed_token, family_id, is_consumed, expires_at, family_expires_at, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      tokenRow.userId,
      newHashedToken,
      tokenRow.familyId,
      newExpiresAt.getTime(),
      tokenRow.familyExpiresAt.getTime(), // Unchanged absolute family expiry
      now.getTime(),
    ),
  ]);

  const jwtSecret = env.JWT_SECRET || "sightforge-jwt-secret-key-default";
  const accessToken = await signJwt(
    {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
    },
    jwtSecret,
  );

  const isSecure = env.ENVIRONMENT !== "test";
  const cookieHeaders = buildSessionCookieHeaders(accessToken, newRawToken, {
    isSecure,
  });

  const headers = new Headers({ "Content-Type": "application/json" });
  for (const cookie of cookieHeaders) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(
    JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
      },
    }),
    {
      status: 200,
      headers,
    },
  );
}

/**
 * POST /auth/logout
 * Revokes refresh token family in D1 and clears session cookies (R9, R10).
 */
async function handleLogout(
  ctx: RequestContext,
  env: AuthWorkerEnv,
): Promise<Response> {
  const refreshToken = extractRefreshTokenFromRequest(ctx.request);
  if (refreshToken) {
    try {
      const hashedToken = await sha256Hex(refreshToken);
      const db = drizzle(env.DB);
      const rows = await db
        .select({ familyId: refreshTokens.familyId })
        .from(refreshTokens)
        .where(eq(refreshTokens.hashedToken, hashedToken))
        .limit(1);

      if (rows[0]) {
        await revokeTokenFamily(env.DB, rows[0].familyId);
      }
    } catch {
      // Best-effort database family cleanup on sign-out
    }
  }

  const logoutCookies = buildLogoutCookieHeaders({
    isSecure: env.ENVIRONMENT !== "test",
  });
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const cookie of logoutCookies) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers,
  });
}

/**
 * GET /auth/me
 * Returns authenticated user profile.
 */
async function handleGetMe(
  ctx: RequestContext,
  env: AuthWorkerEnv,
): Promise<Response> {
  if (!ctx.tokenPayload?.sub) {
    throw new HttpError(401, "unauthorized", "Authentication required.");
  }

  const db = drizzle(env.DB);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, ctx.tokenPayload.sub))
    .limit(1);

  const user = rows[0];
  if (!user) {
    throw new HttpError(404, "not-found", "User account not found.");
  }

  return Response.json({ user }, { status: 200 });
}
