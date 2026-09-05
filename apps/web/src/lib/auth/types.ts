/**
 * SightForge Web - Authentication & Credential Types
 *
 * Defines contract shapes for in-browser Argon2id derivation,
 * API requests/responses, and session state (R5, R6, R56).
 */

export interface Argon2Params {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  version: string;
}

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memoryKiB: 19456,
  iterations: 2,
  parallelism: 1,
  version: "0x13",
};

export const ARGON2_PARAMETER_FLOOR = {
  minMemoryKiB: 19456,
  minIterations: 2,
  minParallelism: 1,
  allowedVersions: ["0x13", "19"],
} as const;

export interface SaltResponse {
  clientSalt: string;
  argon2Params: Argon2Params;
}

export interface User {
  id: string;
  email: string;
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
}

export interface DerivationRequestMessage {
  type: "derive";
  id: string;
  password: string;
  saltHex: string;
  params: Argon2Params;
}

export interface DerivationSuccessMessage {
  type: "result";
  id: string;
  keyHex: string;
}

export interface DerivationErrorMessage {
  type: "error";
  id: string;
  error: string;
}

export type DerivationResponseMessage =
  DerivationSuccessMessage | DerivationErrorMessage;
