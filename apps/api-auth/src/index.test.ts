import { describe, expect, it } from "vitest";
import worker from "./index";

describe("sightforge-api-auth worker", () => {
  it("responds with json service status", async () => {
    const req = new Request("http://localhost/health");
    const res = await worker.fetch(req, {} as any);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { service: string; status: string };
    expect(data.service).toBe("sightforge-api-auth");
    expect(data.status).toBe("ready");
  });
});
