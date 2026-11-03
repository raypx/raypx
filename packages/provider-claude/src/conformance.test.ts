import { ClaudeAdapter } from "./index.js";
import { createTestProviderHost, createTestTransport } from "@raypx/provider-testing";
import {
  defineProviderConformance,
  defineDrainConformance,
} from "@raypx/provider-testing/conformance";

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
