import { expect, it } from "vite-plus/test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forwardTerminalHook } from "../../../../src/runtime/terminal/hook";
import { startTerminalHost, terminalFetch } from "../../../../src/runtime/terminal/host";

it("returns no vendor output when the host is missing instead of blocking or approving", async () => {
  const dir = await mkdtemp(join(tmpdir(), "raypx-hook-missing-"));
  try {
    expect(
      await forwardTerminalHook(dir, "codex", {
        session_id: "session",
        cwd: dir,
        hook_event_name: "PermissionRequest",
        tool_name: "Bash",
        tool_input: { command: "printf test" },
      }),
    ).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === "win32")(
  "maps only the broker decision and acknowledges delivery after the caller writes it",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "raypx-hook-forward-")),
      project = await realpath(dir);
    const host = startTerminalHost({ directory: dir, projects: [project], away: true });
    try {
      await terminalFetch(host.endpoint, "owner", "/watch", { active: true });
      const pending = forwardTerminalHook(dir, "claude", {
        session_id: "session",
        cwd: project,
        hook_event_name: "PermissionRequest",
        tool_name: "Bash",
        tool_input: { command: "printf test" },
      });
      await expect.poll(() => host.broker.pendingRequests().length).toBe(1);
      const request = host.broker.pendingRequests()[0]!;
      host.broker.decide({
        id: request.id,
        revision: request.revision,
        epoch: request.epoch,
        receiptId: crypto.randomUUID(),
        decision: { type: "deny", note: "Keep the project" },
      });
      const result = await pending;
      expect(result?.output).toEqual({
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "deny", message: "Keep the project" },
        },
      });
      expect(host.broker.get(request.id)?.status).toBe("decided");
      await result!.delivered();
      expect(host.broker.get(request.id)?.status).toBe("delivered");
    } finally {
      await host.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
