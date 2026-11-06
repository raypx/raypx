import { expect, it } from "vite-plus/test";
import { nativeAgentProviders } from "./agent-options";

it("runs the Codex first-delivery gate without requiring another installed provider", () => {
  expect(nativeAgentProviders({})).toEqual(["codex"]);
});

it.each(["claude", "codex", "claude, codex"])("accepts explicit provider selection %s", (value) => {
  expect(nativeAgentProviders({ RAYPX_LIVE_AGENT_PROVIDERS: value })).toEqual(
    value.split(",").map((name) => name.trim()),
  );
});

it.each(["", "unknown", "codex,", "codex,codex"])(
  "rejects invalid provider selection %j before packaging or inference",
  (value) => {
    expect(() => nativeAgentProviders({ RAYPX_LIVE_AGENT_PROVIDERS: value })).toThrow(
      "RAYPX_LIVE_AGENT_PROVIDERS",
    );
  },
);
