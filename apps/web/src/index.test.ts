import { describe, expect, it } from "vitest";
import worker from "./index";

describe("sightforge-web worker", () => {
  it("responds with static assets placeholder text", async () => {
    const req = new Request("http://localhost/");
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("SightForge Web");
  });
});
