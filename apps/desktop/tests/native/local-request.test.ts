import { expect, it } from "vite-plus/test";
import { assertRendererLocalMethod } from "../../native/local-request";
it("keeps private host execution and raw task snapshots outside the renderer bridge", () => {
  for (const method of [
    "agents.remote",
    "agents.start",
    "agents.command",
    "agents.snapshot",
    "agents.detach",
    "host.authorize",
    "observed.remote",
    "roots.register",
  ] as const)
    expect(() => assertRendererLocalMethod(method)).toThrow(/bridge|renderer|picker/);
  for (const method of [
    "agents.local.execute",
    "agents.projects",
    "agents.capabilities",
    "agents.configure",
    "memory.create",
    "memory.resolve",
  ] as const)
    expect(() => assertRendererLocalMethod(method)).not.toThrow();
});
