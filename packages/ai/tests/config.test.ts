import { expect, it } from "vite-plus/test";
import { parseAiSettings } from "../src/config.js";
import { createCompatibleProvider } from "../src/providers.js";

it("reads optional AI settings with environment references instead of keys", () => {
  expect(parseAiSettings(undefined)).toEqual({});
  const settings = {
    provider: "my-server",
    model: "model",
    api: "openai-completions",
    api_key_env: "RAYPX_AI_API_KEY",
    auth: "bearer",
    timeout_ms: 1000,
  };
  expect(parseAiSettings(settings)).toEqual(settings);
});

it.each([
  null,
  [],
  "private-key",
  { api_key: "private-key" },
  { provider: "" },
  { timeout_ms: 0 },
  { max_tokens: 10, context_window: 2 },
  { temperature: NaN },
  { api: "unsupported" },
  { auth: "unsupported" },
  { api_key_env: "$(private-key)" },
  { provider: "../path" },
])("rejects malformed settings without echoing their contents: %j", (value) => {
  expect(() => parseAiSettings(value)).toThrow("AI configuration is invalid.");
});

it.each(["http://127.0.0.1:11434/v1/", "http://[::1]:11434/v1", "https://models.example.test/v1"])(
  "creates an explicit compatible model catalog at %s",
  (baseUrl) => {
    const provider = createCompatibleProvider({
      id: "self-hosted",
      baseUrl,
      api: "openai-completions",
      models: [{ id: "my-model" }],
    });
    expect(provider.getModels()[0]).toMatchObject({
      id: "my-model",
      provider: "self-hosted",
      api: "openai-completions",
      baseUrl: baseUrl.replace(/\/$/, ""),
    });
  },
);

it.each([
  "http://external.example.test/v1",
  "https://user:private-key@example.test/v1",
  "https://example.test/v1?api_key=private-key",
  "file:///private-key",
  "not a URL",
])("rejects insecure or credential-bearing endpoints without echoing them", (baseUrl) => {
  expect(() =>
    createCompatibleProvider({
      id: "test",
      baseUrl,
      api: "openai-completions",
      models: [{ id: "model" }],
    }),
  ).toThrow("AI configuration is invalid.");
});
