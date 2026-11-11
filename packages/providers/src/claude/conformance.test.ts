import { ClaudeAdapter } from "./index.js";
import { createTestProviderHost, createTestTransport } from "../../tests/helpers/host.js";
import {
  defineProviderConformance,
  defineDrainConformance,
} from "../../tests/helpers/conformance.js";

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
