import { describe, expect, it } from "vite-plus/test";

import { createApiClient, parseApiProblemDetails } from "./index.js";

describe("createApiClient", () => {
  it("creates a typed lazy client without making a request", () => {
    const client = createApiClient({ baseUrl: "https://api.example.com/" });
    expect(client.admin.users.list).toBeTypeOf("function");
  });

  it("supports a relative same-origin transport", () => {
    const client = createApiClient();
    expect(client.health).toBeTypeOf("function");
  });

  it.each<[string, (client: ReturnType<typeof createApiClient>) => Promise<unknown>]>([
    ["archive", (client) => client.projects.archive({ projectId: "project-1" })],
    ["restore", (client) => client.projects.restore({ projectId: "project-1" })],
    [
      "review update",
      (client) => client.projects.reviews.update({ reviewId: "review-1", status: "approved" }),
    ],
    [
      "Agent cancellation",
      (client) => client.projects.agentRuns.cancel({ runId: "run-1", idempotencyKey: "cancel-1" }),
    ],
    [
      "Agent retry",
      (client) => client.projects.agentRuns.retry({ runId: "run-1", idempotencyKey: "retry-1" }),
    ],
  ])("uses POST for %s so mutations cannot enter GET batching", async (_name, invoke) => {
    const methods: string[] = [];
    const client = createApiClient({
      baseUrl: "https://api.example.com",
      fetch: async (input, init) => {
        methods.push(new Request(input, init).method);
        return new Response("{}", {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await expect(invoke(client)).rejects.toBeDefined();
    expect(methods).toEqual(["POST"]);
  });

  it("parses RFC 9457 details from an oRPC error", () => {
    expect(
      parseApiProblemDetails({
        data: {
          problem: {
            type: "https://api.voidmix.dev/problems/PROJECT_ACCESS_DENIED",
            title: "Project access denied",
            status: 403,
            code: "PROJECT_ACCESS_DENIED",
            values: { projectId: "p1" },
            fieldErrors: [],
            requestId: "req-1",
          },
        },
      }),
    ).toMatchObject({ code: "PROJECT_ACCESS_DENIED", status: 403, requestId: "req-1" });
  });
});
