import { ClaudeAdapter } from "./index.ts";
import { createTestProviderHost, createTestTransport } from "../../tests/helpers/host.ts";
import {
  defineProviderConformance,
  defineDrainConformance,
} from "../../tests/helpers/conformance.ts";

function fixture() {
  const host = createTestProviderHost(),
    transport = createTestTransport();
  const session = new ClaudeAdapter(
    { executable: "fixture", directory: "/project", mode: "run", environment: {} },
    host.ports,
    transport.factory,
  );
  return {
    session,
    host,
    complete: () => transport.receive({ type: "result", result: "Completed", is_error: false }),
    started: () => true,
    drain: transport.drain,
  };
}

defineProviderConformance("Claude", fixture);
defineDrainConformance("Claude", fixture);
