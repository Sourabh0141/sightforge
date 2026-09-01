/**
 * @sightforge/api-auth - Cloudflare Turnstile Server-Side Validation
 *
 * Implements server-side bot challenge verification per R71.
 */

import { HttpError } from "@sightforge/worker-kit";

export interface TurnstileSiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

/**
 * Validates a Turnstile token against Cloudflare's siteverify endpoint.
 */
export async function verifyTurnstileToken(
  token: unknown,
  clientIp: string | null,
  secretKey?: string,
  isDevOrTest: boolean = false,
): Promise<void> {
  // If no secret key is configured in dev/test, or test bypass token is provided, allow pass-through
  if (!secretKey || isDevOrTest) {
    if (
      token === "dummy-turnstile-token" ||
      token === "test-turnstile-token" ||
      !secretKey
    ) {
      return;
    }
  }

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    throw new HttpError(
      400,
      "invalid-input",
      "Turnstile challenge response token is required.",
    );
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token.trim());
    if (clientIp) {
      formData.append("remoteip", clientIp);
    }

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      },
    );

    if (!response.ok) {
      throw new HttpError(
        502,
        "internal-error",
        "Turnstile verification service unreachable.",
      );
    }

    const data = (await response.json()) as TurnstileSiteverifyResponse;
    if (!data.success) {
      throw new HttpError(
        400,
        "invalid-input",
        "Bot challenge verification failed.",
      );
    }
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    throw new HttpError(
      502,
      "internal-error",
      "Failed to verify bot challenge token.",
    );
  }
}
