import { expect, it, vi, afterEach } from "vite-plus/test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindingKey } from "../../../../src/runtime/daemon/vault";
import {
  readTerminalConfiguration,
  writeTerminalConfiguration,
} from "../../../../src/runtime/daemon/terminal-settings";
import { startDaemon } from "../../../../src/runtime/daemon/server";
import { profilePath } from "../../../../src/runtime/state";

afterEach(() => vi.unstubAllEnvs());

function bindingFixture(profile: string, apiUrl = "https://example.test") {
  const accountId = "account",
    rootId = crypto.randomUUID();
  const binding = {
    apiUrl,
    accountId,
    deviceId: crypto.randomUUID(),
    epoch: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const key = bindingKey(apiUrl, accountId),
    directory = join(profile, "hosts", key);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(profile, "host-binding.json"), JSON.stringify(binding));
  writeFileSync(join(profile, "host-session.json"), JSON.stringify({ apiUrl, accountId }));
  writeFileSync(
    join(directory, "observed.json"),
    JSON.stringify({ rootIds: [rootId], away: true, waitSeconds: 120 }),
  );
  writeFileSync(
    join(directory, "remote-control.json"),
    JSON.stringify({
      installationId: crypto.randomUUID(),
      accounts: { [accountId]: { enabled: true } },
    }),
  );
  return { directory, key, binding, rootId };
}
it("starts disabled without importing old settings or changing their files", () => {
  const profile = mkdtempSync(join(tmpdir(), "raypx-terminal-current-"));
  try {
    const f = bindingFixture(profile);
    const source = readFileSync(join(f.directory, "observed.json"), "utf8");
    expect(readTerminalConfiguration(profile)).toEqual({
      version: 1,
      local: { rootIds: [], away: false, waitSeconds: 300 },
      clouds: {},
    });
    expect(readFileSync(join(f.directory, "observed.json"), "utf8")).toBe(source);
    const current = {
      version: 1 as const,
      local: { rootIds: [f.rootId], away: true, waitSeconds: 120 },
      clouds: { [f.key]: { enabled: true, rootIds: [f.rootId] } },
    };
    writeTerminalConfiguration(join(profile, "terminal"), current);
    expect(readTerminalConfiguration(profile)).toEqual(current);
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
});
it.skipIf(process.platform === "win32")(
  "makes the Host and local operations ready while cloud restoration remains blocked",
  async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "raypx-offline-ready-"));
    vi.stubEnv("RAYPX_HOME", join(dataDir, "home"));
    vi.stubEnv("CLAUDE_CONFIG_DIR", join(dataDir, "claude"));
    vi.stubEnv("CODEX_HOME", join(dataDir, "codex"));
    const configDirs = { claude: join(dataDir, "claude"), codex: join(dataDir, "codex") };
    let grantStarted = false,
      grantAborted = false;
    const api = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        if (new URL(request.url).pathname.endsWith("/grant")) {
          grantStarted = true;
          request.signal.addEventListener(
            "abort",
            () => {
              grantAborted = true;
            },
            { once: true },
          );
          return new Promise<Response>(() => {});
        }
        return Response.json({});
      },
    });
    const profile = profilePath({ dataDir }),
      f = bindingFixture(profile, api.url.origin);
    writeTerminalConfiguration(join(profile, "terminal"), {
      version: 1,
      local: { rootIds: [f.rootId], away: true, waitSeconds: 120 },
      clouds: { [f.key]: { enabled: true, rootIds: [f.rootId] } },
    });
    writeFileSync(
      join(profile, "host-session.json"),
      JSON.stringify({ accountId: f.binding.accountId, apiUrl: api.url.origin + "/" }),
    );
    const start = Date.now();
    const host = await startDaemon({
      dataDir,
      vault: {
        get: async () => ({ ...f.binding, credential: "k".repeat(64) }),
        set: async () => true,
        remove: async () => {},
      },
    });
    try {
      // Allow cold SQLite setup under parallel suites, while staying below the
      // ten-second cloud timeout. The network request must still be pending.
      expect(Date.now() - start).toBeLessThan(8000);
      await expect.poll(() => grantStarted, { timeout: 5000 }).toBe(true);
      const before = Date.now();
      expect(await host.terminal.request("approvals.local.settings", {})).toMatchObject({
        away: true,
      });
      expect(Array.isArray(await host.terminal.request("connectors.status", { configDirs }))).toBe(
        true,
      );
      await expect(
        host.terminal.request("connectors.install", { provider: "claude", configDirs }),
      ).rejects.toMatchObject({
        code: process.platform === "darwin" ? "COMPILED_CLI_REQUIRED" : "UNSUPPORTED_PLATFORM",
      });
      expect(Date.now() - before).toBeLessThan(3000);
      expect(grantAborted).toBe(false);
    } finally {
      await host.close();
      await api.stop(true);
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
  20_000,
);

it.skipIf(process.platform === "win32")(
  "keeps ordinary project setup usable when terminal settings need recovery",
  async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "raypx-terminal-recovery-"));
    const terminal = join(profilePath({ dataDir }), "terminal");
    mkdirSync(terminal, { recursive: true });
    writeFileSync(join(terminal, "settings.json"), "invalid");
    const host = await startDaemon({ dataDir });
    try {
      expect(host.terminal.supported).toBe(false);
      const root = (await host.runtime.request("roots.register", { path: dataDir })) as {
        id: string;
      };
      expect(
        await host.runtime.request("agents.configure", { rootId: root.id, providers: ["claude"] }),
      ).toEqual({ configured: true });
      expect(() => host.terminal.projectsChanged()).not.toThrow();
      expect(host.runtime.agents.projectProviders(root.id)).toEqual(["claude"]);
      expect(readFileSync(join(terminal, "settings.json"), "utf8")).toBe("invalid");
    } finally {
      await host.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
);
