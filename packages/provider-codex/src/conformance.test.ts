import { CodexAdapter } from "./index.js";
import { createTestProviderHost, createTestTransport } from "@raypx/provider-testing";
import {
  defineProviderConformance,
  defineDrainConformance,
} from "@raypx/provider-testing/conformance";

function fixture() {
  const host = createTestProviderHost(),
    transport = createTestTransport();
  const session = new CodexAdapter(
    { executable: "fixture", directory: "/project", mode: "run", environment: {} },
    host.ports,
    transport.factory,
  );
  return {
    session,
    host,
    complete: () =>
      transport.receive({
        method: "turn/completed",
        params: { turn: { id: "test-turn", status: "completed" } },
      }),
    started: () => true,
    drain: transport.drain,
  };
}

defineProviderConformance("Codex", fixture);
defineDrainConformance("Codex", fixture);
