import { describe, expect, it } from "vitest";
import worker from "./index";

describe("sightforge-events worker", () => {
  it("responds with json service status on fetch", async () => {
    const req = new Request("http://localhost/events");
    const res = await worker.fetch(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { service: string; status: string };
    expect(data.service).toBe("sightforge-events");
    expect(data.status).toBe("ready");
  });

  it("handles queue batches", async () => {
    const batch = {
      queue: "sightforge-events-queue",
      messages: [
        {
          id: "msg-1",
          timestamp: new Date(),
          body: { event: "object-created" },
        },
      ],
      ackAll: () => {},
      retryAll: () => {},
    } as unknown as MessageBatch<unknown>;

    await expect(worker.queue(batch)).resolves.toBeUndefined();
  });
});
