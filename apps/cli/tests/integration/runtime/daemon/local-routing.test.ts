import { expect, it } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntime } from "../../../../src/runtime";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
it("rejects every daemon-only approval operation in stdio and preserves the local identity across accounts and restart", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "raypx-terminal-routing-"));
  let runtime = createRuntime({ dataDir });
  try {
    for (const method of [
      "approvals.local.settings",
      "approvals.local.configure",
      "approvals.local.list",
      "approvals.local.get",
      "approvals.local.decide",
      "approvals.local.watch",
      "host.terminal.settings",
      "host.terminal.configure",
    ] as const)
      await expect(runtime.request(method, {})).rejects.toMatchObject({ code: "DAEMON_REQUIRED" });
    const device = await runtime.agents.localDevice(LOCAL_WORKSPACE_ID);
    await runtime.agents.localDevice("account-a");
    await runtime.agents.localDevice("account-b");
    await runtime.close();
    runtime = createRuntime({ dataDir });
    expect((await runtime.agents.localDevice(LOCAL_WORKSPACE_ID)).id).toBe(device.id);
  } finally {
    await runtime.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
