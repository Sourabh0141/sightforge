import { describe, it, expect } from "vitest";
import { ERROR_MAPPINGS, getErrorDescriptor } from "./errors";

describe("SightForge Error Vocabulary (P4 U1, R58, R72)", () => {
  it("defines user-facing copy for all standard plan 2 reason codes", () => {
    const requiredCodes = [
      "quota-exhausted",
      "spend-ceiling",
      "counter-unavailable",
      "rate-limit-exceeded",
      "size",
      "format",
      "duration",
      "codec-unsupported",
      "source-changed",
      "timeout",
      "inference-error",
      "unauthorized",
      "forbidden",
      "not-found",
      "invalid-input",
      "conflict",
      "unsupported-media-type",
      "internal-error",
      "result-expired",
      "capacity-exhausted",
    ];

    for (const code of requiredCodes) {
      const descriptor = ERROR_MAPPINGS[code];
      expect(descriptor).toBeDefined();
      expect(descriptor?.title.length).toBeGreaterThan(0);
      expect(descriptor?.message.length).toBeGreaterThan(0);
    }
  });

  it("safely falls back for unknown or undefined reason codes (R58)", () => {
    const fallbackNull = getErrorDescriptor(null);
    expect(fallbackNull.title).toBe("Something went wrong");

    const fallbackUndefined = getErrorDescriptor(undefined);
    expect(fallbackUndefined.title).toBe("Something went wrong");

    const fallbackUnknown = getErrorDescriptor("completely_unknown_error_code");
    expect(fallbackUnknown.title).toBe("Unexpected error");
    expect(fallbackUnknown.message).toContain("completely_unknown_error_code");
  });
});
