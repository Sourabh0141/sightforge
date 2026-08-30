import { describe, expect, it } from "vitest";
import { UI_PACKAGE_VERSION } from "./index";

describe("@sightforge/ui", () => {
  it("exports ui package version", () => {
    expect(UI_PACKAGE_VERSION).toBe("0.1.0");
  });
});
