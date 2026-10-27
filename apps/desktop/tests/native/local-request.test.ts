import { expect, it } from "vite-plus/test";
import { assertRendererLocalMethod, rendererLocalParams } from "../../native/local-request";
it("keeps private host execution and raw task snapshots outside the renderer bridge", () => {
  for (const method of [
    "agents.remote",
    "agents.start",
    "agents.command",
    "agents.snapshot",
    "agents.detach",
    "host.authorize",
    "observed.remote",
    "approvals.local.watch",
    "roots.register",
  ] as const)
    expect(() => assertRendererLocalMethod(method)).toThrow(/bridge|renderer|picker/);
  for (const method of [
    "agents.local.execute",
    "agents.projects",
    "agents.capabilities",
    "agents.configure",
    "approvals.local.settings",
    "approvals.local.decide",
    "memory.create",
    "memory.resolve",
  ] as const)
    expect(() => assertRendererLocalMethod(method)).not.toThrow();
});

it("leaves account-free local approvals untouched by Native origin and account scoping", () => {
  const params = { rootIds: [], away: false, waitSeconds: 300 };
  expect(rendererLocalParams("approvals.local.configure", params, {}, "cloud-scope")).toBe(params);
  expect(rendererLocalParams("approvals.local.list", {}, {}, "cloud-scope")).toEqual({});
});
