import { describe, expect, it } from "vitest";
import worker, { Counter, JobRoom } from "./index";

describe("sightforge-api-jobs worker", () => {
  it("responds with json service status", async () => {
    const req = new Request("http://localhost/jobs");
    const res = await worker.fetch(req, {} as any);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { service: string; status: string };
    expect(data.service).toBe("sightforge-api-jobs");
    expect(data.status).toBe("ready");
  });

  it("exports Counter and JobRoom Durable Object classes", () => {
    expect(Counter).toBeDefined();
    expect(JobRoom).toBeDefined();
    const stubState = {} as DurableObjectState;
    const counter = new Counter(stubState, {});
    const room = new JobRoom(stubState, {});
    expect(counter).toBeInstanceOf(Counter);
    expect(room).toBeInstanceOf(JobRoom);
  });
});
