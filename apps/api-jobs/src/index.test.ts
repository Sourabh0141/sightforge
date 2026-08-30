import { describe, expect, it } from "vitest";
import worker, { JobRoom } from "./index";

describe("sightforge-api-jobs worker", () => {
  it("responds with json service status", async () => {
    const req = new Request("http://localhost/jobs");
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { service: string; status: string };
    expect(data.service).toBe("sightforge-api-jobs");
    expect(data.status).toBe("ready");
  });

  it("exports JobRoom Durable Object class", () => {
    expect(JobRoom).toBeDefined();
    const stubState = {} as DurableObjectState;
    const instance = new JobRoom(stubState, {});
    expect(instance).toBeInstanceOf(JobRoom);
  });
});
