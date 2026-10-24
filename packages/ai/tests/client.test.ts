import { afterEach, expect, it, vi } from "vite-plus/test";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import {
  AiError,
  createAiClient,
  Type,
  type AiClient,
  type Context,
  type CredentialStore,
} from "../src/index.js";

const clients: AiClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.close();
  vi.restoreAllMocks();
});
const context: Context = { messages: [{ role: "user", content: "Hello", timestamp: 0 }] };
function fixture() {
  const faux = fauxProvider({ provider: "test", models: [{ id: "model" }] });
  const client = createAiClient({ providers: [faux.provider] });
  clients.push(client);
  return { client, faux, selection: { provider: "test", model: "model" } };
}

it("lists default catalogs offline without resolving credentials", () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network"));
  const read = vi.fn(async () => {
    throw new Error("Do not read private credentials");
  });
  const credentials = { read } as unknown as CredentialStore;
  const client = createAiClient({ credentials });
  clients.push(client);
  expect(client.providers().map((provider) => provider.id)).toEqual([
    "anthropic",
    "openai",
    "google",
    "openrouter",
  ]);
  expect(client.models("anthropic").length).toBeGreaterThan(0);
  expect(client.models("openai")[0]).toMatchObject({ api: "openai-responses" });
  expect(JSON.stringify(client.models())).not.toContain("headers");
  expect(read).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
});

it("streams text and returns the same final response with usage", async () => {
  const { client, faux, selection } = fixture();
  faux.setResponses([fauxAssistantMessage("Hello from Pi")]);
  const stream = client.stream(selection, context);
  const deltas: string[] = [];
  for await (const event of stream) if (event.type === "text_delta") deltas.push(event.delta);
  const result = await stream.result();
  expect(deltas.join("")).toBe("Hello from Pi");
  expect(result.content).toContainEqual({ type: "text", text: "Hello from Pi" });
  expect(result.usage.totalTokens).toBeGreaterThan(0);
  expect(faux.state.callCount).toBe(1);
});

it("preserves structured tool calls without executing a tool", async () => {
  const { client, faux, selection } = fixture();
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall("read_file", { path: "test.txt" }), {
      stopReason: "toolUse",
    }),
  ]);
  const result = await client.complete(selection, {
    ...context,
    tools: [
      {
        name: "read_file",
        description: "Read a granted file",
        parameters: Type.Object({ path: Type.String() }),
      },
    ],
  });
  expect(result.stopReason).toBe("toolUse");
  expect(result.content[0]).toMatchObject({
    type: "toolCall",
    name: "read_file",
    arguments: { path: "test.txt" },
  });
  expect(faux.state.callCount).toBe(1);
});

it("removes provider diagnostics from successful events and results", async () => {
  const { client, faux, selection } = fixture();
  faux.setResponses([
    {
      ...fauxAssistantMessage("Done"),
      errorMessage: "private-key",
      diagnostics: [{ type: "retry", timestamp: 0, error: { message: "private-key" } }],
    },
  ]);
  const stream = client.stream(selection, context);
  for await (const event of stream) expect(JSON.stringify(event)).not.toContain("private-key");
  expect(JSON.stringify(await stream.result())).not.toContain("private-key");
});

it("sanitizes provider failures and never retries inference", async () => {
  const { client, faux, selection } = fixture();
  faux.setResponses([
    fauxAssistantMessage("", {
      stopReason: "error",
      errorMessage: "private-key https://user:password@example.test",
    }),
  ]);
  const failure = await client.complete(selection, context).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(AiError);
  expect(failure).toMatchObject({ code: "AI_REQUEST_FAILED" });
  expect(String(failure)).not.toMatch(/private-key|password/);
  expect(faux.state.callCount).toBe(1);
});

it.each(["abort", "timeout", "close"])("ends a stalled provider promptly on %s", async (action) => {
  const { client, faux, selection } = fixture();
  faux.setResponses([async () => new Promise(() => {})]);
  const controller = new AbortController();
  const result = client.complete(selection, context, {
    signal: controller.signal,
    timeoutMs: action === "timeout" ? 20 : 1000,
  });
  if (action === "abort") controller.abort();
  if (action === "close") client.close();
  await expect(result).rejects.toMatchObject({
    code: action === "timeout" ? "AI_TIMEOUT" : "AI_ABORTED",
  });
});

it("aborts upstream work when a stream consumer stops early", async () => {
  const { client, faux, selection } = fixture();
  faux.setResponses([
    async (_context, options) =>
      new Promise((resolve) => {
        options?.signal?.addEventListener(
          "abort",
          () => resolve(fauxAssistantMessage("", { stopReason: "aborted" })),
          { once: true },
        );
        resolve(fauxAssistantMessage("A long streaming answer"));
      }),
  ]);
  const stream = client.stream(selection, context);
  for await (const _event of stream) break;
  await expect(stream.result()).rejects.toMatchObject({ code: "AI_ABORTED" });
});

it("rejects invalid models, deadlines, pre-aborted requests and a closed client", async () => {
  const { client, selection } = fixture();
  await expect(client.complete({ ...selection, model: "missing" }, context)).rejects.toMatchObject({
    code: "AI_MODEL_NOT_FOUND",
  });
  await expect(client.complete(selection, context, { timeoutMs: 0 })).rejects.toMatchObject({
    code: "AI_INVALID_CONFIG",
  });
  await expect(
    client.complete(selection, context, { signal: AbortSignal.abort() }),
  ).rejects.toMatchObject({ code: "AI_ABORTED" });
  client.close();
  await expect(client.complete(selection, context)).rejects.toMatchObject({ code: "AI_CLOSED" });
});
