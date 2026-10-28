import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createDriver } from "../../../../src/runtime/agents/harness/registry";

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
      codexRecord: vi.fn(),
      claudeRecord: vi.fn(),
      session: vi.fn(),
      codexCompleted: vi.fn(),
      claudeCompleted: vi.fn(),
      failed: vi.fn(),
      turnId: vi.fn(),
    };
    for (const provider of ["codex", "claude"] as const) {
      const output = join(directory, provider);
      const driver = createDriver(
        provider,
        {
          executable,
          directory,
          mode: "run",
          environment: { PATH: "/bundled/bun", RAYPX_TEST_OUTPUT: output },
        },
        ports,
      );
      expect(await driver.handle.completed).toBe(0);
      expect(readFileSync(output, "utf8")).toBe("/bundled/bun");
    }
  },
);
