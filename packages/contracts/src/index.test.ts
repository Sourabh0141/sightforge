import { describe, expect, it } from "vitest";
import { SIGHTFORGE_CONTRACT_VERSION } from "./index";

describe("@sightforge/contracts", () => {
  it("exports contract version", () => {
    expect(SIGHTFORGE_CONTRACT_VERSION).toBe("1.0.0");
  });
});
