import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createAdapter } from "../../../../src/runtime/agents/harness/registry";

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
