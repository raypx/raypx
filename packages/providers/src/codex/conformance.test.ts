import { CodexAdapter } from "./index.ts";
import { createTestProviderHost, createTestTransport } from "../../tests/helpers/host.ts";
import {
  defineProviderConformance,
  defineDrainConformance,
} from "../../tests/helpers/conformance.ts";

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
