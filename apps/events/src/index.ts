/**
 * sightforge-events Worker placeholder (Queue consumer & Modal callback)
 */
export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response(
      JSON.stringify({ service: "sightforge-events", status: "ready" }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },

  async queue(batch: MessageBatch<unknown>): Promise<void> {
    // Queue consumer placeholder
    console.log(
      `Processing queue batch with ${batch.messages.length} messages`,
    );
  },
};
