import { describe, expect, it } from "vitest";
import worker from "./index";

describe("sightforge-scheduler worker", () => {
  it("responds with json service status on fetch", async () => {
    const req = new Request("http://localhost/scheduler");
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { service: string; status: string };
    expect(data.service).toBe("sightforge-scheduler");
    expect(data.status).toBe("ready");
  });

  it("handles scheduled cron event", async () => {
    const event = {
      cron: "*/5 * * * *",
      scheduledTime: Date.now(),
      type: "scheduled",
    } as ScheduledEvent;

    await expect(
      worker.scheduled(event, {}, {} as ExecutionContext),
    ).resolves.toBeUndefined();
  });
});
