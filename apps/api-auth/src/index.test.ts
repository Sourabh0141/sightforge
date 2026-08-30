import { describe, expect, it } from "vitest";
import worker, { Counter } from "./index";

describe("sightforge-api-auth worker", () => {
  it("responds with json service status", async () => {
    const req = new Request("http://localhost/health");
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { service: string; status: string };
    expect(data.service).toBe("sightforge-api-auth");
    expect(data.status).toBe("ready");
  });

  it("exports Counter Durable Object class", () => {
    expect(Counter).toBeDefined();
    const stubState = {} as DurableObjectState;
    const instance = new Counter(stubState, {});
    expect(instance).toBeInstanceOf(Counter);
  });
});
