/**
 * SightForge Web - Argon2id WebAssembly Worker (R5, KTD6)
 *
 * Runs Argon2id password hardening off the main thread in WebAssembly.
 * Guarantees that the UI does not freeze during the 1.5s - 4s derivation.
 */

import { argon2id } from "hash-wasm";
import type { DerivationRequestMessage } from "./types";

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

self.onmessage = async (event: MessageEvent<DerivationRequestMessage>) => {
  if (event.data?.type !== "derive") return;

  const { id, password, saltHex, params } = event.data;

  try {
    const saltBytes = hexToBytes(saltHex);

    const keyHex = await argon2id({
      password,
      salt: saltBytes,
      parallelism: params.parallelism,
      iterations: params.iterations,
      memorySize: params.memoryKiB,
      hashLength: 32, // 32 bytes -> 256 bits = 64 hex characters
      outputType: "hex",
    });

    self.postMessage({
      type: "result",
      id,
      keyHex,
    });
  } catch (err) {
    self.postMessage({
      type: "error",
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
