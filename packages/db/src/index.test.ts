import { describe, expect, it } from "vitest";
import { DB_PACKAGE_VERSION } from "./index";
import { schemaVersion } from "./schema";

describe("@sightforge/db", () => {
  it("exports db package version and schema version", () => {
    expect(DB_PACKAGE_VERSION).toBe("0.1.0");
    expect(schemaVersion).toBe("1.0.0");
  });
});
