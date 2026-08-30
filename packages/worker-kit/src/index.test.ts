import { describe, expect, it } from "vitest";
import { Counter, JobRoom, WORKER_KIT_VERSION } from "./index";

describe("@sightforge/worker-kit", () => {
  it("exports worker kit version", () => {
    expect(WORKER_KIT_VERSION).toBe("0.1.0");
  });

  it("instantiates Counter DO stub and handles fetch", async () => {
    const stubState = {} as DurableObjectState;
    const counter = new Counter(stubState, {});
    const res = await counter.fetch(new Request("http://localhost/count"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; count: number };
    expect(data.ok).toBe(true);
    expect(data.count).toBe(0);
  });

  it("instantiates JobRoom DO stub and handles fetch", async () => {
    const stubState = {} as DurableObjectState;
    const jobRoom = new JobRoom(stubState, {});
    const res = await jobRoom.fetch(new Request("http://localhost/room"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; room: string };
    expect(data.ok).toBe(true);
    expect(data.room).toBe("stub");
  });
});
