import { agentFixtures } from "../../../helpers/agents.ts";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createAdapter } from "../../../../src/runtime/agents/infrastructure/providers/process.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it.skipIf(process.platform === "win32")(
  "starts each provider process with the runtime's child environment",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "raypx-provider-environment-"));
    roots.push(directory);
    const executable = join(directory, "provider");
    writeFileSync(executable, '#!/bin/sh\nprintf "%s" "$PATH" > "$RAYPX_TEST_OUTPUT"\n', {
      mode: 0o755,
    });
    const ports = {
      approval: {
        ask: vi.fn(async () => ({ type: "allow" as const })),
        hook: () => ({ url: "http://127.0.0.1/hook/task", token: "fixture" }),
      },
      current: () => true,
      emit: vi.fn(),
    };
    for (const provider of ["codex", "claude"] as const) {
      const output = join(directory, provider);
      const driver = createAdapter(
        provider,
        {
          executable,
          directory,
          mode: "run",
          environment: { PATH: "/bundled/bun", RAYPX_TEST_OUTPUT: output },
        },
        ports,
      );
      await expect(driver.handle.completed).resolves.toBeUndefined();
      expect(readFileSync(output, "utf8")).toBe("/bundled/bun");
    }
  },
);

const { host } = agentFixtures();
it("rejects an explicit model for a provider that owns its native model settings", async () => {
  const f = await host("codex", "codex");
  const task = {
    ...f.task,
    model: { provider: "fixture", model: "unsupported", connectionId: "a".repeat(64) },
  };
  await f.runtime.start(
    "desktop:" + LOCAL_WORKSPACE_ID,
    task.id,
    task,
    new Date(Date.now() + 15_000).toISOString(),
  );
  expect(f.runtime.localTask(LOCAL_WORKSPACE_ID, task.id, 0).task).toMatchObject({
    status: "failed",
    summary: "UNSUPPORTED_CAPABILITY",
  });
});
