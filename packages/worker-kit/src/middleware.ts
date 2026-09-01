/**
 * @sightforge/worker-kit - Composable Middleware Pipeline
 *
 * Implements unauthenticatedChain and authenticatedChain pipelines
 * fulfilling the Edge API architecture diagram and KTD3, KTD6, R110.
 */

import { applySecurityHeaders } from "./headers.js";
import {
  handleCors,
  appendCorsHeaders,
  DEFAULT_ALLOWED_ORIGINS,
} from "./cors.js";
import { assertCsrf } from "./csrf.js";
import { getClientIpPrefix } from "./ip.js";
import { extractTokenFromRequest, verifyJwt, type JwtPayload } from "./jwt.js";
import {
  assertRateLimitIp,
  assertRateLimitUser,
  type RateLimitPolicy,
} from "./rate-limit.js";
import { createErrorResponse, HttpError } from "./errors.js";
import { Logger } from "./logging.js";

export interface RequestContext {
  request: Request;
  env: any;
  ctx?: ExecutionContext;
  ipPrefix: string;
  correlationId: string;
  logger: Logger;
  userId?: string;
  tokenPayload?: JwtPayload;
}

export type Handler = (ctx: RequestContext) => Promise<Response>;

export interface ChainOptions {
  allowedOrigins?: string[];
  ipRateLimit?: RateLimitPolicy;
  userRateLimit?: RateLimitPolicy;
  jwtSecret?: string;
  jwtPreviousSecret?: string;
  skipIpRateLimit?: boolean;
}

/**
 * Creates request context with correlation ID and logger.
 */
function createRequestContext(
  request: Request,
  env: any,
  ctx?: ExecutionContext,
): RequestContext {
  const correlationId =
    request.headers.get("X-Correlation-Id") ||
    request.headers.get("X-Request-Id") ||
    crypto.randomUUID();
  const ipPrefix = getClientIpPrefix(request);
  const logger = new Logger("sightforge-edge", correlationId);

  return {
    request,
    env,
    ctx,
    ipPrefix,
    correlationId,
    logger,
  };
}

/**
 * Unauthenticated Pipeline:
 * Security Headers -> IP Rate Limit -> CORS -> Handler -> Structured Logging
 */
export async function unauthenticatedChain(
  request: Request,
  env: any,
  handler: Handler,
  options: ChainOptions = {},
  ctx?: ExecutionContext,
): Promise<Response> {
  const allowedOrigins = options.allowedOrigins || DEFAULT_ALLOWED_ORIGINS;
  const origin = request.headers.get("Origin");

  // 1. CORS Preflight
  const preflight = handleCors(request, { allowedOrigins });
  if (preflight) {
    return applySecurityHeaders(preflight);
  }

  const context = createRequestContext(request, env, ctx);

  try {
    // 2. IP Rate Limit Pass 1 (before any compute)
    if (!options.skipIpRateLimit && env.COUNTER) {
      await assertRateLimitIp(request, env.COUNTER, options.ipRateLimit);
    }

    // 3. Execute handler
    const response = await handler(context);

    // 4. Attach CORS and Security Headers
    const corsResponse = appendCorsHeaders(response, origin, {
      allowedOrigins,
    });
    return applySecurityHeaders(corsResponse);
  } catch (err) {
    context.logger.error("Unauthenticated request failed", {
      path: new URL(request.url).pathname,
      error: err instanceof Error ? err.message : String(err),
    });

    const errorResponse = createErrorResponse(err);
    const corsError = appendCorsHeaders(errorResponse, origin, {
      allowedOrigins,
    });
    return applySecurityHeaders(corsError);
  }
}

/**
 * Authenticated Pipeline:
 * Security Headers -> IP Rate Limit -> CORS -> CSRF -> JWT Verify -> User Rate Limit -> Handler
 */
export async function authenticatedChain(
  request: Request,
  env: any,
  handler: Handler,
  options: ChainOptions = {},
  ctx?: ExecutionContext,
): Promise<Response> {
  const allowedOrigins = options.allowedOrigins || DEFAULT_ALLOWED_ORIGINS;
  const origin = request.headers.get("Origin");

  // 1. CORS Preflight
  const preflight = handleCors(request, { allowedOrigins });
  if (preflight) {
    return applySecurityHeaders(preflight);
  }

  const context = createRequestContext(request, env, ctx);

  try {
    // 2. IP Rate Limit Pass 1 (runs before JWT verification to prevent DoS)
    if (!options.skipIpRateLimit && env.COUNTER) {
      await assertRateLimitIp(request, env.COUNTER, options.ipRateLimit);
    }

    // 3. CSRF Defense for state-changing methods (R68, R69)
    assertCsrf(request, allowedOrigins);

    // 4. Token Extraction & Stateless JWT Verification (R8, R12, R15)
    const token = extractTokenFromRequest(request);
    if (!token) {
      throw new HttpError(
        401,
        "unauthorized",
        "Authentication token is required.",
      );
    }

    const activeKey = options.jwtSecret || env.JWT_SECRET;
    const previousKey = options.jwtPreviousSecret || env.JWT_PREVIOUS_SECRET;

    if (!activeKey) {
      throw new HttpError(
        500,
        "internal-error",
        "JWT signing secret is not configured.",
      );
    }

    const payload = await verifyJwt(token, { activeKey, previousKey });
    context.userId = payload.sub;
    context.tokenPayload = payload;

    // 5. User Rate Limit Pass 2 (runs after authenticated identity is proven)
    if (env.COUNTER) {
      await assertRateLimitUser(
        payload.sub,
        env.COUNTER,
        options.userRateLimit,
      );
    }

    // 6. Execute Handler
    const response = await handler(context);

    // 7. Attach CORS & Security Headers
    const corsResponse = appendCorsHeaders(response, origin, {
      allowedOrigins,
    });
    return applySecurityHeaders(corsResponse);
  } catch (err) {
    context.logger.error("Authenticated request failed", {
      path: new URL(request.url).pathname,
      userId: context.userId,
      error: err instanceof Error ? err.message : String(err),
    });

    const errorResponse = createErrorResponse(err);
    const corsError = appendCorsHeaders(errorResponse, origin, {
      allowedOrigins,
    });
    return applySecurityHeaders(corsError);
  }
}
