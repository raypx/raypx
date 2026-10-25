import assert from "node:assert/strict";
import {
  copyFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { createApiClient, createTaskClient } from "@raypx/client";
import { localResponseSchema, type LocalMethod } from "@raypx/contracts/local";
import type { ControlInfo, TerminalDecision } from "@raypx/contracts/terminal";
import type { DeviceGrant } from "@raypx/contracts/tasks";

assert.equal(
  process.env.RAYPX_LIVE_AGENTS,
  "1",
  "Real model acceptance requires RAYPX_LIVE_AGENTS=1",
);
const configFile = process.env.RAYPX_HOST_ACCEPTANCE_CONFIG;
assert.ok(configFile, "Provide the private synthetic-account acceptance configuration");
const config = JSON.parse(await readFile(configFile, "utf8"));
const apiUrl = new URL(config.apiUrl);
assert.equal(apiUrl.protocol, "http:");
assert.ok(
  ["127.0.0.1", "localhost"].includes(apiUrl.hostname),
  "This private plaintext acceptance only runs on loopback",
);
const binary = resolvePath(import.meta.dirname, "../../dist/raypx"),
  directory = await mkdtemp(join(tmpdir(), "raypx-daemon-live-"));
const stateDirectory = join(directory, "state"),
  configDirectory = join(directory, "config");
await mkdir(join(directory, "project"), { mode: 0o700 });
const project = await realpath(join(directory, "project"));
await mkdir(configDirectory, { mode: 0o700 });
const env: Record<string, string | undefined> = {
  ...process.env,
  RAYPX_HOME: configDirectory,
  PYTHONDONTWRITEBYTECODE: "1",
};
const claude =
  process.env.RAYPX_CLAUDE_BINARY ?? Bun.which("claude") ?? join(homedir(), ".local/bin/claude");
const codex = process.env.RAYPX_CODEX_BINARY ?? Bun.which("codex");
assert.ok(codex, "Set RAYPX_CODEX_BINARY for the installed CLI");
try {
  const settings = JSON.parse(
    await readFile(
      join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json"),
      "utf8",
    ),
  );
  for (const key of [
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_MODEL",
  ])
    if (!env[key] && typeof settings.env?.[key] === "string") env[key] = settings.env[key];
} catch {
  /* OS authentication may already be available. */
}
env.CLAUDE_CONFIG_DIR = join(directory, "claude");
env.CODEX_HOME = join(directory, "codex");
await mkdir(env.CLAUDE_CONFIG_DIR, { mode: 0o700 });
await mkdir(env.CODEX_HOME, { mode: 0o700 });
await copyFile(
  join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"),
  join(env.CODEX_HOME, "auth.json"),
);
await chmod(join(env.CODEX_HOME, "auth.json"), 0o600);

function proxy() {
  const child = Bun.spawn([binary, "daemon", "proxy", "--data-dir", stateDirectory], {
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  void child.exited.then(() => {
    for (const item of pending.values()) item.reject(new Error("Daemon proxy exited"));
    pending.clear();
  });
  void (async () => {
    for await (const _chunk of child.stderr) {
      /* Diagnostics stay private. */
    }
  })();
  const reader = (async () => {
    let buffer = "";
    const decoder = new TextDecoder();
    for await (const chunk of child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let offset: number;
      while ((offset = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, offset);
        buffer = buffer.slice(offset + 1);
        const parsed = localResponseSchema.safeParse(JSON.parse(line));
        if (!parsed.success) continue;
        const item = pending.get(parsed.data.id);
        if (!item) continue;
        pending.delete(parsed.data.id);
        if ("error" in parsed.data) item.reject(new Error(parsed.data.error.code));
        else item.resolve(parsed.data.result);
      }
    }
  })();
  return {
    request: async <T>(method: LocalMethod, params: unknown): Promise<T> => {
      const id = crypto.randomUUID();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const response = new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Daemon request timed out"));
        }, 30_000);
      });
      try {
        await child.stdin.write(JSON.stringify({ version: 1, id, method, params }) + "\n");
        await child.stdin.flush();
        return (await response) as T;
      } finally {
        clearTimeout(timer);
      }
    },
    close: async () => {
      await child.stdin.end();
      await child.exited;
      await reader;
    },
  };
}
const login = await fetch(new URL("/api/auth/sign-in/email", apiUrl), {
  method: "POST",
  headers: { "content-type": "application/json", origin: apiUrl.origin },
  body: JSON.stringify({ email: config.email, password: config.password }),
});
assert.equal(login.status, 200, "Synthetic account could not sign in");
const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join(";"),
  api = createApiClient({ baseUrl: apiUrl.origin, headers: { cookie, origin: "views://main" } });
let current = proxy(),
  device: DeviceGrant | undefined,
  viewer: ReturnType<typeof createTaskClient> | undefined,
  unsubscribe: (() => void) | undefined;
try {
  const profile = await api.account.get({});
  assert.equal(profile.id, config.userId);
  await current.request("runtime.info", {});
  await current.request("host.session", { apiUrl: apiUrl.origin, accountId: profile.id });
  const info = await current.request<ControlInfo>("host.info", {
    apiUrl: apiUrl.origin,
    accountId: profile.id,
  });
  device = await api.devices.register({
    installationId: info.installationId,
    name: "P1 synthetic host",
    platform: "darwin",
    appVersion: "0.1.0",
    reconnect: false,
  });
  await current.request("host.enable", {
    apiUrl: apiUrl.origin,
    accountId: profile.id,
    enabled: true,
  });
  const authorization = await api.hosts.authorize({
    deviceId: device.deviceId,
    epoch: device.epoch,
  });
  await current.request("host.authorize", {
    apiUrl: apiUrl.origin,
    accountId: profile.id,
    authorization,
  });
  const root = await current.request<{ id: string }>("roots.register", { path: project });
  await current.request("agents.configure", { rootId: root.id, providers: ["claude", "codex"] });
  await current.request("observed.configure", {
    apiUrl: apiUrl.origin,
    accountId: profile.id,
    rootIds: [root.id],
    away: true,
    waitSeconds: 300,
  });
  for (const provider of ["claude", "codex"] as const)
    await current.request("connectors.install", { provider });
  const deadline = Date.now() + 30_000;
  while (
    !(
      await current.request<ControlInfo>("host.info", {
        apiUrl: apiUrl.origin,
        accountId: profile.id,
      })
    ).connected
  ) {
    assert.ok(Date.now() < deadline, "Daemon did not connect");
    await Bun.sleep(200);
  }
  await current.close();
  console.info(JSON.stringify({ stage: "desktop-client-disconnected", deviceId: device.deviceId }));
  viewer = createTaskClient(api, { baseUrl: apiUrl.origin });
  viewer.setAccount(profile.id);
  unsubscribe = viewer.subscribe(() => {});
  for (const provider of ["claude", "codex"] as const) {
    const marker = join(project, "permission-marker.txt");
    await rm(marker, { force: true });
    const prompt =
      "Use the shell tool exactly once with this exact command: printf RAYPX_TERMINAL_P1 > permission-marker.txt . Do not use any other tools." +
      (provider === "codex"
        ? " Request expanded permissions before running it; you are in a read-only sandbox."
        : "");
    const args =
      provider === "claude"
        ? [claude, prompt, "--permission-mode", "manual", "--no-chrome", "--disable-slash-commands"]
        : [
            codex,
            "--no-daemon",
            "--no-alt-screen",
            "--sandbox",
            "read-only",
            "-a",
            "on-request",
            "--dangerously-bypass-hook-trust",
            "-c",
            `projects.${JSON.stringify(project)}.trust_level="trusted"`,
            "-c",
            "check_for_update_on_startup=false",
            prompt,
          ];
    const spec = join(directory, `${provider}.json`);
    await writeFile(
      spec,
      JSON.stringify({
        args,
        cwd: project,
        provider,
        capture: null,
        marker,
        timeoutSeconds: 380,
        screen: join(directory, `${provider}-terminal.txt`),
      }),
      { mode: 0o600 },
    );
    const terminal = Bun.spawn(
      ["python3", resolvePath(import.meta.dirname, "../fixtures/terminal/driver.py"), spec],
      { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    );
    const timeout = setTimeout(() => terminal.kill(), 380_000);
    try {
      const until = Date.now() + 350_000;
      let answered = false;
      while (terminal.exitCode === null && Date.now() < until) {
        const data = await api.observed.list({}),
          request = data.requests.find(
            (value) =>
              value.deviceId === device!.deviceId &&
              value.provider === provider &&
              value.status === "pending",
          );
        if (request && !answered) {
          const full = await api.observed.get({ id: request.id });
          assert.equal(
            JSON.parse(full.body).command,
            "printf RAYPX_TERMINAL_P1 > permission-marker.txt",
          );
          console.info(
            JSON.stringify({ stage: "awaiting-approval", provider, requestId: request.id }),
          );
          if (process.env.RAYPX_P1_BROWSER_APPROVAL !== "1") {
            const decision: TerminalDecision = {
              id: request.id,
              epoch: request.epoch,
              revision: request.revision,
              receiptId: crypto.randomUUID(),
              decision: { type: "allow" },
            };
            const result = await viewer.observed!.decide(decision);
            assert.ok(["decided", "delivered"].includes(result.status));
          }
          answered = true;
        }
        if (await Bun.file(marker).exists()) break;
        await Bun.sleep(250);
      }
      assert.equal(await terminal.exited, 0, "Real terminal did not apply the remote approval");
      assert.equal(await readFile(marker, "utf8"), "RAYPX_TERMINAL_P1");
      console.info(JSON.stringify({ stage: "real-cli-passed", provider, desktopConnected: false }));
    } finally {
      clearTimeout(timeout);
      if (terminal.exitCode === null) {
        terminal.kill();
        await terminal.exited;
      }
      await writeFile(
        join(directory, `${provider}-stderr.txt`),
        await new Response(terminal.stderr).text(),
        { mode: 0o600 },
      );
    }
  }
  current = proxy();
  const restored = await current.request<ControlInfo>("host.info", {
    apiUrl: apiUrl.origin,
    accountId: profile.id,
  });
  assert.equal(restored.connected, true);
  console.info(
    JSON.stringify({ stage: "desktop-client-reconnected", persistent: restored.persistent }),
  );
  await current.close();
  const stopped = Bun.spawn([binary, "daemon", "stop", "--data-dir", stateDirectory], {
    env,
    stdout: "ignore",
    stderr: "ignore",
  });
  assert.equal(await stopped.exited, 0);
  const stopDeadline = Date.now() + 15_000;
  while (true) {
    const status = Bun.spawn([binary, "daemon", "status", "--data-dir", stateDirectory, "--json"], {
      env,
      stdout: "pipe",
      stderr: "ignore",
    });
    const stoppedInfo = JSON.parse(await new Response(status.stdout).text());
    assert.equal(await status.exited, 0);
    if (!stoppedInfo.running) break;
    assert.ok(Date.now() < stopDeadline, "Daemon did not stop");
    await Bun.sleep(100);
  }
  current = proxy();
  const restartDeadline = Date.now() + 30_000;
  while (true) {
    const restartedInfo = await current.request<ControlInfo>("host.info", {
      apiUrl: apiUrl.origin,
      accountId: profile.id,
    });
    if (restartedInfo.connected) {
      assert.equal(restartedInfo.authorized, true);
      assert.equal(restartedInfo.persistent, true);
      break;
    }
    assert.ok(Date.now() < restartDeadline, "Daemon authorization did not restore independently");
    await Bun.sleep(200);
  }
  console.info(JSON.stringify({ stage: "daemon-authorization-restored", browserBootstrap: false }));
  await current.request("host.session", { apiUrl: apiUrl.origin, accountId: null });
  console.info(
    "Real Claude/Codex terminal approvals through PostgreSQL, relay and the independent daemon passed",
  );
} finally {
  unsubscribe?.();
  viewer?.setAccount(null);
  const cleanup = proxy();
  try {
    await cleanup.request("runtime.info", {});
    await cleanup.request("host.session", { apiUrl: apiUrl.origin, accountId: null });
  } catch {
    /* Leave server revocation as the authority if local cleanup fails. */
  } finally {
    await cleanup.close().catch(() => {});
  }
  if (device)
    await api.devices.revoke({ deviceId: device.deviceId, epoch: device.epoch }).catch(() => {});
  await current.close().catch(() => {});
  const stop = Bun.spawn([binary, "daemon", "stop", "--data-dir", stateDirectory], {
    env,
    stdout: "ignore",
    stderr: "ignore",
  });
  await stop.exited;
  await rm(join(env.CODEX_HOME, "auth.json"), { force: true });
}
