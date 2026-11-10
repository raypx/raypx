import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { performanceEnvironment } from "@raypx/tooling/performance";

export async function smokeOwnerIdentity(directory: string) {
  const endpoint = await Bun.file(join(directory, "profiles/native-smoke/daemon.json")).json();
  const response = await fetch(
    endpoint.socket ? "http://localhost/info" : `http://127.0.0.1:${endpoint.port}/info`,
    {
      ...(endpoint.socket ? { unix: endpoint.socket } : { proxy: false }),
      headers: { authorization: `Bearer ${endpoint.token}` },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    },
  );
  assert.equal(response.status, 200, "Independent CLI could not authenticate to the GUI daemon");
  const info = (await response.json()) as {
    pid: number;
    epoch: string;
    builtAt: number;
    version: string;
  };
  assert.ok(Number.isSafeInteger(info.pid) && info.pid > 0);
  assert.equal(info.epoch, endpoint.epoch);
  assert.equal(info.builtAt, endpoint.builtAt);
  assert.equal(info.version, endpoint.version);
  return { pid: info.pid, epoch: info.epoch, builtAt: info.builtAt, version: info.version };
}

type Run = (
  binary: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) => Promise<{ code: number; output: string }>;
type Options = { platform?: NodeJS.Platform; run?: Run };
const run: Run = async (binary, args, env) => {
  const child = Bun.spawn([binary, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    ...(env ? { env } : {}),
  });
  const deadline = setTimeout(() => child.kill(), 30_000);
  try {
    const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return { code, output };
  } finally {
    clearTimeout(deadline);
  }
};

async function command(
  action: "status" | "start" | "stop" | "restart",
  directory: string,
  options: Options,
) {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "win32") return;
  const binary = resolve(
    import.meta.dirname,
    "../../../resources/bin",
    platform === "win32" ? "raypx.exe" : "raypx",
  );
  const env = performanceEnvironment(process.env);
  // The explicit HTTPS cookie acceptance phase may use its configured fixture API.
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY"]) delete env[key];
  return (options.run ?? run)(
    binary,
    ["daemon", action, "--profile", "native-smoke", "--data-dir", directory, "--json"],
    {
      ...env,
      RAYPX_HOME: join(directory, "config"),
      CLAUDE_CONFIG_DIR: join(directory, "claude"),
      CODEX_HOME: join(directory, "codex"),
    },
  );
}

export async function assertSmokeOwnerRunning(directory: string, options: Options = {}) {
  const result = await command("status", directory, options);
  if (!result) return;
  assert.equal(result.code, 0);
  assert.equal(
    JSON.parse(result.output).running,
    true,
    "GUI Quit terminated its independent execution owner",
  );
}

export async function stopSmokeOwner(directory: string, options: Options = {}) {
  const result = await command("stop", directory, options);
  return !result || result.code === 0;
}

export async function startSmokeOwner(directory: string, options: Options = {}) {
  const result = await command("start", directory, options);
  assert.equal(result?.code, 0, "Independent CLI could not start the smoke daemon");
  return smokeOwnerIdentity(directory);
}

export async function restartSmokeOwner(directory: string, options: Options = {}) {
  const result = await command("restart", directory, options);
  return result !== undefined && result.code === 0;
}

/** Test driver authority stays in Bun; the native host never exposes this router. */
export async function smokeOwnerRequest(directory: string, method: string, params: unknown) {
  const endpoint = await Bun.file(join(directory, "profiles/native-smoke/daemon.json")).json();
  const response = await fetch(
    endpoint.socket ? "http://localhost/rpc" : `http://127.0.0.1:${endpoint.port}/rpc`,
    {
      ...(endpoint.socket ? { unix: endpoint.socket } : { proxy: false }),
      method: "POST",
      headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
      body: JSON.stringify({ version: 1, id: crypto.randomUUID(), method, params }),
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    },
  );
  assert.equal(response.status, 200);
  const packet = (await response.json()) as { result?: unknown; error?: { code: string } };
  if (packet.error) throw new Error(packet.error.code);
  return packet.result;
}
