export function aiFixture(
  options: {
    status?: number;
    tool?: boolean;
    stall?: boolean;
    api?: "anthropic-messages" | "openai-responses";
  } = {},
) {
  const requests: {
    path: string;
    authorization: string | null;
    apiKey: string | null;
    body: Record<string, unknown>;
  }[] = [];
  let cancelled = false;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as Record<string, unknown>;
      requests.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get("authorization"),
        apiKey: request.headers.get("x-api-key"),
        body,
      });
      if (options.status)
        return Response.json(
          { error: { message: "private-key https://user:password@example.test", type: "fixture" } },
          { status: options.status },
        );
      if (options.stall)
        return new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      if (options.api === "anthropic-messages") {
        const events = [
          {
            type: "message_start",
            message: {
              id: "fixture",
              type: "message",
              role: "assistant",
              model: "fixture-model",
              content: [],
              stop_reason: null,
              usage: { input_tokens: 12, output_tokens: 0 },
            },
          },
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "PI_AI_READY" },
          },
          { type: "content_block_stop", index: 0 },
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: 4 },
          },
          { type: "message_stop" },
        ];
        return new Response(
          events
            .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
            .join(""),
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      if (options.api === "openai-responses") {
        const item = {
          id: "message-fixture",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "PI_AI_READY", annotations: [] }],
        };
        const events = [
          {
            type: "response.created",
            response: { id: "response-fixture", model: "fixture-model", created_at: 0 },
          },
          {
            type: "response.output_item.added",
            output_index: 0,
            item: { ...item, status: "in_progress", content: [] },
          },
          {
            type: "response.content_part.added",
            item_id: item.id,
            output_index: 0,
            content_index: 0,
            part: { type: "output_text", text: "", annotations: [] },
          },
          {
            type: "response.output_text.delta",
            item_id: item.id,
            output_index: 0,
            content_index: 0,
            delta: "PI_AI_READY",
          },
          {
            type: "response.output_text.done",
            item_id: item.id,
            output_index: 0,
            content_index: 0,
            text: "PI_AI_READY",
          },
          { type: "response.output_item.done", output_index: 0, item },
          {
            type: "response.completed",
            response: {
              id: "response-fixture",
              model: "fixture-model",
              status: "completed",
              output: [item],
              usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
            },
          },
        ];
        return new Response(
          events
            .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
            .join(""),
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      const chunk = (delta: unknown, finish_reason: string | null = null) => ({
        id: "pi-fixture",
        object: "chat.completion.chunk",
        created: 0,
        model: "fixture-model",
        choices: [{ index: 0, delta, finish_reason }],
      });
      const frames = options.tool
        ? [
            chunk({
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "call-fixture",
                  type: "function",
                  function: { name: "read_file", arguments: '{"path":' },
                },
              ],
            }),
            chunk({ tool_calls: [{ index: 0, function: { arguments: '"fixture.txt"}' } }] }),
            chunk({}, "tool_calls"),
          ]
        : [
            chunk({ role: "assistant", content: "PI_" }),
            chunk({ content: "AI_READY" }),
            chunk({}, "stop"),
          ];
      frames.push({
        id: "pi-fixture",
        object: "chat.completion.chunk",
        created: 0,
        model: "fixture-model",
        choices: [],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      } as (typeof frames)[number]);
      return new Response(
        frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/v1`,
    requests,
    get cancelled() {
      return cancelled;
    },
    stop: () => server.stop(true),
  };
}
