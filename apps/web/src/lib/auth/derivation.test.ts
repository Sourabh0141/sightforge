import { describe, it, expect } from "vitest";
import { assertArgon2ParameterFloor, deriveClientKey } from "./derivation";
import { DEFAULT_ARGON2_PARAMS, type Argon2Params } from "./types";

describe("Client-Side Argon2id Derivation & Floor Checks (P4 U2, R5, R6, KTD6)", () => {
  it("passes validation for baseline default parameters", () => {
    expect(() =>
      assertArgon2ParameterFloor(DEFAULT_ARGON2_PARAMS),
    ).not.toThrow();
  });

  it("rejects parameters below memory floor (R6)", () => {
    const weakMemory: Argon2Params = {
      ...DEFAULT_ARGON2_PARAMS,
      memoryKiB: 1024, // Below 19456 KiB
    };
    expect(() => assertArgon2ParameterFloor(weakMemory)).toThrow(
      /below security floor of 19456 KiB/,
    );
  });

  it("rejects parameters below iteration floor (R6)", () => {
    const weakIterations: Argon2Params = {
      ...DEFAULT_ARGON2_PARAMS,
      iterations: 1, // Below 2
    };
    expect(() => assertArgon2ParameterFloor(weakIterations)).toThrow(
      /below security floor of 2/,
    );
  });

  it("rejects parameters below parallelism floor (R6)", () => {
    const weakParallelism: Argon2Params = {
      ...DEFAULT_ARGON2_PARAMS,
      parallelism: 0,
    };
    expect(() => assertArgon2ParameterFloor(weakParallelism)).toThrow(
      /below security floor of 1/,
    );
  });

  it("rejects unauthorized Argon2 versions (R6)", () => {
    const badVersion: Argon2Params = {
      ...DEFAULT_ARGON2_PARAMS,
      version: "0x10",
    };
    expect(() => assertArgon2ParameterFloor(badVersion)).toThrow(
      /Expected 0x13/,
    );
  });

  it("derives a 256-bit hexadecimal key deterministically", async () => {
    const password = "correct-horse-battery-staple-secure";
    const saltHex = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

    const key1 = await deriveClientKey(
      password,
      saltHex,
      DEFAULT_ARGON2_PARAMS,
    );
    const key2 = await deriveClientKey(
      password,
      saltHex,
      DEFAULT_ARGON2_PARAMS,
    );

    expect(typeof key1).toBe("string");
    expect(key1.length).toBe(64); // 32 bytes in hex = 64 characters
    expect(/^[0-9a-f]{64}$/.test(key1)).toBe(true);
    expect(key1).toBe(key2);
  });

  it("produces different keys for different salts or passwords", async () => {
    const password = "correct-horse-battery-staple-secure";
    const saltA = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const saltB = "908e7f6d5c4b3a291807f6e5d4c3b2a1";

    const keyA = await deriveClientKey(password, saltA, DEFAULT_ARGON2_PARAMS);
    const keyB = await deriveClientKey(password, saltB, DEFAULT_ARGON2_PARAMS);

    expect(keyA).not.toBe(keyB);
  });
});
