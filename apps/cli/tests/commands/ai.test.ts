import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createAiClient, createCompatibleProvider, Type } from "@raypx/ai";
import { parseCliArgs } from "../../src/commands/args";
import { runCommand } from "../../src/commands";
import { aiFixture } from "../helpers/ai";

let directory: string;
const servers: ReturnType<typeof aiFixture>[] = [];
const clients: ReturnType<typeof createAiClient>[] = [];
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "raypx-ai-command-"));
  vi.stubEnv("RAYPX_HOME", directory);
});
afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
function fixture(options: Parameters<typeof aiFixture>[0] = {}) {
  const server = aiFixture(options);
  servers.push(server);
  return server;
}
async function invoke(action: string, value?: unknown) {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await runCommand(
      parseCliArgs([
        "ai",
        action,
        ...(value === undefined ? [] : [JSON.stringify(value)]),
        "--json",
      ]),
      {},
    );
    expect(output).toHaveBeenCalledTimes(1);
    return JSON.parse(String(output.mock.calls[0]?.[0]));
  } finally {
    output.mockRestore();
  }
}
const settings = (url: string) => ({
  provider: "local",
  model: "fixture-model",
  api: "openai-completions",
  base_url: url,
});

it("lists providers and catalogs without credentials or a local database", async () => {
  expect((await invoke("providers")).map((p: { id: string }) => p.id)).toContain("anthropic");
  expect((await invoke("models", { provider: "openai" }))[0]).toMatchObject({
    provider: "openai",
    api: "openai-responses",
  });
  await expect(readFile(join(directory, "config.toml"))).rejects.toMatchObject({ code: "ENOENT" });
});
it("keeps offline catalogs independent of invalid TOML and custom endpoints", async () => {
  await writeFile(join(directory, "config.toml"), "[ai\ninvalid");
  expect((await invoke("providers")).map((p: { id: string }) => p.id)).toContain("google");
  expect((await invoke("models", { provider: "openai" })).length).toBeGreaterThan(0);
});

it("reads AI settings alongside server profiles and never modifies the user's TOML", async () => {
  const server = fixture();
  const source = `base_url = "https://raypx.pro"\nprofile = "beta"\n[profiles.beta]\nbase_url = "https://beta.raypx.pro"\n[ai]\nprovider = "local"\nmodel = "fixture-model"\napi = "openai-completions"\nbase_url = ${JSON.stringify(server.url)}\n`;
  await writeFile(join(directory, "config.toml"), source);
  vi.stubEnv("OPENAI_API_KEY", "ambient-private-key");
  const result = await invoke("complete", { prompt: "Test Pi" });
  expect(result.content).toContainEqual({ type: "text", text: "PI_AI_READY" });
  expect(result.usage).toMatchObject({ input: 12, output: 4, totalTokens: 16 });
  expect(server.requests).toHaveLength(1);
  expect(server.requests[0]).toMatchObject({
    path: "/v1/chat/completions",
    authorization: null,
    apiKey: null,
  });
  expect(await readFile(join(directory, "config.toml"), "utf8")).toBe(source);
});

it("uses only the explicit key environment variable for a configured endpoint", async () => {
  const server = fixture();
  vi.stubEnv("RAYPX_TEST_PI_KEY", "fixture-private-key");
  const result = await invoke("complete", {
    ...settings(server.url),
    api_key_env: "RAYPX_TEST_PI_KEY",
    prompt: "Test Pi",
  });
  expect(result.stopReason).toBe("stop");
  expect(server.requests[0]?.authorization).toBe("Bearer fixture-private-key");
  expect(JSON.stringify(result)).not.toContain("fixture-private-key");
});

it.each(["anthropic-messages", "openai-responses"] as const)(
  "uses %s and explicit Bearer authentication through the real SDK",
  async (api) => {
    const server = fixture({ api });
    vi.stubEnv("RAYPX_TEST_PI_KEY", "fixture-bearer-token");
    const base_url = api === "anthropic-messages" ? new URL(server.url).origin : server.url;
    const result = await invoke("complete", {
      ...settings(base_url),
      api,
      auth: "bearer",
      api_key_env: "RAYPX_TEST_PI_KEY",
      prompt: "Test Pi",
    });
    expect(result.content).toContainEqual(
      expect.objectContaining({ type: "text", text: "PI_AI_READY" }),
    );
    expect(result.usage).toMatchObject({ input: 12, output: 4, totalTokens: 16 });
    expect(server.requests[0]).toMatchObject({
      path: api === "anthropic-messages" ? "/v1/messages" : "/v1/responses",
      authorization: "Bearer fixture-bearer-token",
      apiKey: null,
    });
  },
);

it("parses streamed tool-call arguments through the real Pi SDK", async () => {
  const server = fixture({ tool: true });
  const client = createAiClient({
    providers: [
      createCompatibleProvider({
        id: "local",
        api: "openai-completions",
        baseUrl: server.url,
        models: [{ id: "fixture-model" }],
      }),
    ],
  });
  clients.push(client);
  const result = await client.complete(
    { provider: "local", model: "fixture-model" },
    {
      messages: [{ role: "user", content: "Read the file", timestamp: 0 }],
      tools: [
        {
          name: "read_file",
          description: "Read",
          parameters: Type.Object({ path: Type.String() }),
        },
      ],
    },
  );
  expect(result.stopReason).toBe("toolUse");
  expect(result.content[0]).toMatchObject({
    type: "toolCall",
    name: "read_file",
    arguments: { path: "fixture.txt" },
  });
  expect(server.requests).toHaveLength(1);
});

it.each([
  [401, "AI_AUTH_REQUIRED"],
  [429, "AI_RATE_LIMITED"],
  [500, "AI_REQUEST_FAILED"],
])("maps HTTP %s to %s without leaking provider errors or retrying", async (status, code) => {
  const server = fixture({ status });
  const failure = await invoke("complete", { ...settings(server.url), prompt: "Test Pi" }).catch(
    (error: unknown) => error,
  );
  expect(failure).toMatchObject({ code });
  expect(String(failure)).not.toMatch(/private-key|password/);
  expect(server.requests).toHaveLength(1);
});

it("cancels a stalled real HTTP stream on its deadline", async () => {
  const server = fixture({ stall: true });
  await expect(
    invoke("complete", { ...settings(server.url), prompt: "Test Pi", timeout_ms: 40 }),
  ).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  expect(server.requests).toHaveLength(1);
});

it("requires a model selection and rejects plaintext keys or parser diagnostics", async () => {
  await expect(invoke("complete", { prompt: "Test Pi" })).rejects.toMatchObject({
    code: "AI_NOT_CONFIGURED",
  });
  for (const source of [
    '[ai]\napi_key = "private-key"',
    '[ai]\nmodel = "unterminated-private-key',
  ]) {
    await writeFile(join(directory, "config.toml"), source);
    const failure = await invoke("complete", { prompt: "Test Pi" }).catch(
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: "AI_INVALID_CONFIG" });
    expect(String(failure)).not.toContain("private-key");
  }
});
