import { afterEach, expect, it, vi } from "vite-plus/test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  connectorSettingsFile,
  stableCliStatus,
  assertStableUpgrade,
  connectorCommand,
  connectorStatus,
} from "../../../src/runtime/daemon/connectors";
import { planHookSettings } from "../../../src/runtime/terminal/settings";
import { cliBuild } from "../../../src/runtime/daemon/build";
afterEach(() => vi.unstubAllEnvs());
it("uses explicit TOML and persists installed destinations independently of launchd environment", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-connector-paths-"));
  vi.stubEnv("RAYPX_HOME", directory);
  vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
  vi.stubEnv("CODEX_HOME", undefined);
  try {
    writeFileSync(
      join(directory, "connector-paths.json"),
      JSON.stringify({ codex: "/tmp/custom-codex" }),
    );
    expect(connectorSettingsFile("codex", directory)).toBe("/tmp/custom-codex/hooks.json");
    writeFileSync(join(directory, "config.toml"), '[connectors]\ncodex_home="/tmp/toml-codex"');
    expect(connectorSettingsFile("codex", directory)).toBe("/tmp/toml-codex/hooks.json");
    expect(connectorSettingsFile("codex", directory, { codex: "/tmp/gui-codex" })).toBe(
      "/tmp/gui-codex/hooks.json",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it("checks the real hook binary, exposes upgrade state and rejects a downgrade", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-connector-binary-")),
    bin = join(directory, "bin"),
    config = join(directory, "claude");
  mkdirSync(bin);
  mkdirSync(config);
  vi.stubEnv("RAYPX_HOME", directory);
  vi.stubEnv("CLAUDE_CONFIG_DIR", config);
  const binary = join(bin, "raypx"),
    metadata = join(bin, "installation.json");
  writeFileSync(binary, "owned binary", { mode: 0o700 });
  writeFileSync(
    metadata,
    JSON.stringify({
      digest: createHash("sha256").update(readFileSync(binary)).digest("hex"),
      version: "0.0.1",
      builtAt: 0,
    }),
  );
  writeFileSync(
    join(config, "settings.json"),
    planHookSettings("claude", null, connectorCommand(directory, "claude"), "install").after,
  );
  try {
    const value = (await connectorStatus(directory)).find((item) => item.provider === "claude");
    expect(value).toMatchObject({
      installed: true,
      hookInstalled: true,
      updateAvailable: true,
      settingsFile: join(config, "settings.json"),
    });
    rmSync(binary);
    expect((await connectorStatus(directory))[0]).toMatchObject({
      installed: false,
      hookInstalled: true,
      error: "HOST_BINARY_MISSING",
    });
    writeFileSync(binary, "changed binary");
    expect(stableCliStatus().error).toBe("INSTALLATION_CONFLICT");
    expect(() => assertStableUpgrade({ version: "99.0.0" })).toThrow("newer");
    expect(() => assertStableUpgrade({ ...cliBuild, builtAt: cliBuild.builtAt + 1 })).toThrow(
      "newer",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
