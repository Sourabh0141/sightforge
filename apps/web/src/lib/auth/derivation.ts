/**
 * SightForge Web - Client-Side Key Derivation Controller (R5, R6, KTD6)
 *
 * Enforces hardcoded parameter floor to defeat downgrade attacks (R6),
 * orchestrates Argon2id WebAssembly worker execution off the main thread (KTD6),
 * and isolates plaintext password handling (R5).
 */

import { argon2id } from "hash-wasm";
import {
  ARGON2_PARAMETER_FLOOR,
  type Argon2Params,
  type DerivationRequestMessage,
  type DerivationResponseMessage,
} from "./types";

/**
 * Validates that the provided Argon2 parameters meet or exceed the hardcoded security floor (R6).
 * Throws an explicit error before any derivation runs if tampered or downgraded parameters are returned.
 */
export function assertArgon2ParameterFloor(params: Argon2Params): void {
  if (!params || typeof params !== "object") {
    throw new Error("Invalid or missing Argon2 parameters.");
  }

  if (params.memoryKiB < ARGON2_PARAMETER_FLOOR.minMemoryKiB) {
    throw new Error(
      `Argon2 memory parameter ${params.memoryKiB} KiB is below security floor of ${ARGON2_PARAMETER_FLOOR.minMemoryKiB} KiB (R6).`,
    );
  }

  if (params.iterations < ARGON2_PARAMETER_FLOOR.minIterations) {
    throw new Error(
      `Argon2 iterations parameter ${params.iterations} is below security floor of ${ARGON2_PARAMETER_FLOOR.minIterations} (R6).`,
    );
  }

  if (params.parallelism < ARGON2_PARAMETER_FLOOR.minParallelism) {
    throw new Error(
      `Argon2 parallelism parameter ${params.parallelism} is below security floor of ${ARGON2_PARAMETER_FLOOR.minParallelism} (R6).`,
    );
  }

  const normalizedVersion = String(params.version || "").toLowerCase();
  const isValidVersion = (
    ARGON2_PARAMETER_FLOOR.allowedVersions as readonly string[]
  ).some((v) => v.toLowerCase() === normalizedVersion);

  if (!isValidVersion) {
    throw new Error(
      `Argon2 version '${params.version}' is not permitted. Expected 0x13 (R6).`,
    );
  }
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives the 256-bit client credential key using Argon2id WebAssembly.
 * In browser environments, spawns a dedicated Web Worker to prevent UI lockup.
 * In non-worker environments (e.g. Node.js unit tests), computes via WebAssembly directly.
 */
export async function deriveClientKey(
  password: string,
  saltHex: string,
  params: Argon2Params,
  timeoutMs = 20000,
): Promise<string> {
  // 1. Enforce hardcoded parameter floor (R6)
  assertArgon2ParameterFloor(params);

  if (!password || password.length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }

  if (!saltHex || saltHex.trim().length < 16) {
    throw new Error("Salt must be a valid hex string of at least 16 bytes.");
  }

  // 2. If running in browser with Web Worker support, derive in worker thread (KTD6)
  if (typeof window !== "undefined" && typeof Worker !== "undefined") {
    return new Promise<string>((resolve, reject) => {
      let worker: Worker | null = null;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
      const correlationId = crypto.randomUUID();

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (worker) {
          worker.terminate();
          worker = null;
        }
      };

      timeoutTimer = setTimeout(() => {
        cleanup();
        reject(
          new Error("Client-side password derivation timed out after 20s."),
        );
      }, timeoutMs);

      try {
        worker = new Worker(
          new URL("./derivation.worker.ts", import.meta.url),
          { type: "module" },
        );

        worker.onmessage = (event: MessageEvent<DerivationResponseMessage>) => {
          if (event.data?.id !== correlationId) return;

          cleanup();

          if (event.data.type === "result") {
            resolve(event.data.keyHex);
          } else if (event.data.type === "error") {
            reject(
              new Error(event.data.error || "Derivation failed in worker."),
            );
          }
        };

        worker.onerror = (err) => {
          cleanup();
          reject(new Error(`Worker error: ${err.message}`));
        };

        const message: DerivationRequestMessage = {
          type: "derive",
          id: correlationId,
          password,
          saltHex,
          params,
        };

        worker.postMessage(message);
      } catch (workerInitErr) {
        cleanup();
        // Fall back to direct WebAssembly derivation if worker initialization fails
        const saltBytes = hexToBytes(saltHex);
        argon2id({
          password,
          salt: saltBytes,
          parallelism: params.parallelism,
          iterations: params.iterations,
          memorySize: params.memoryKiB,
          hashLength: 32,
          outputType: "hex",
        })
          .then(resolve)
          .catch(reject);
      }
    });
  }

  // 3. Fallback for Node.js test environment / SSR
  const saltBytes = hexToBytes(saltHex);
  return argon2id({
    password,
    salt: saltBytes,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: 32,
    outputType: "hex",
  });
}
