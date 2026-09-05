import { describe, it, expect, vi } from "vitest";
import {
  getNextUtcMidnight,
  formatResetCountdown,
  probeCapacityState,
} from "./capacity";

describe("Capacity Exhaustion Detection (P4 U1, R4)", () => {
  it("calculates next UTC midnight correctly", () => {
    const midnight = getNextUtcMidnight();
    expect(midnight.getUTCHours()).toBe(0);
    expect(midnight.getUTCMinutes()).toBe(0);
    expect(midnight.getUTCSeconds()).toBe(0);
    expect(midnight.getTime()).toBeGreaterThan(Date.now());
  });

  it("formats countdown string in Xh Ym format", () => {
    const target = new Date(Date.now() + 6 * 3600 * 1000 + 12 * 60 * 1000);
    const formatted = formatResetCountdown(target);
    expect(formatted).toMatch(/^Resets in \d+h \d+m$/);
  });

  it("detects capacity exhaustion when same-origin probe succeeds during failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeCapacityState();
    expect(result.isExhausted).toBe(true);
    expect(result.reason).toBe("spend-ceiling");
    expect(result.resetCountdown).toBeDefined();

    vi.unstubAllGlobals();
  });

  it("detects offline state when same-origin probe fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probeCapacityState();
    expect(result.isExhausted).toBe(false);
    expect(result.reason).toBe("offline");

    vi.unstubAllGlobals();
  });
});
