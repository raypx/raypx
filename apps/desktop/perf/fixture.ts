import assert from "node:assert/strict";
import { dirname, join, resolve, relative, sep } from "node:path";
import { mkdir, writeFile, mkdtemp, rm, access } from "node:fs/promises";
import { Database } from "bun:sqlite";
import type { LaunchContext, Context } from "@hona/strobe";
import { verifyCliPayload } from "@raypx/tooling/build/cli";
import { performanceEnvironment } from "@raypx/tooling/performance";
import { enrollTestProfile } from "./enroll.js";

type State = {
  binary: string;
  dataDir: string;
  env: Record<string, string>;
  close(): Promise<void>;
};
const owned = new Map<string, State>();
function payloadFor(exe: string) {
  return process.platform === "darwin"
    ? resolve(dirname(exe), "../Resources/bin")
    : join(dirname(exe), "bin");
}
function profileData(env: Record<string, string>) {
  return process.platform === "win32"
    ? join(env.LOCALAPPDATA!, "Raypx")
    : join(env.HOME!, "Library/Application Support/Raypx");
}
export async function stateFor(ctx: Pick<LaunchContext<unknown>, "home" | "exe" | "env">) {
  const existing = ctx.home && owned.get(ctx.home);
  if (existing) return existing;
  assert.ok(ctx.home && ctx.exe && ctx.env, "Strobe must provide a private native launch");
  if (process.platform === "darwin")
    assert.equal(
      process.env.RAYPX_STROBE_DISPOSABLE_ACCOUNT,
      "1",
      "macOS requires an isolated OS account or disposable runner",
    );
  const env = ctx.env;
  assert.ok(env.STROBE_OWNER && env.STROBE_HOME, "Strobe ownership must reach the daemon");
  assert.equal(
    resolve(env.STROBE_HOME),
    resolve(ctx.home),
    "Unexpected Strobe process ownership home",
  );
  await verifyCliPayload(payloadFor(ctx.exe));
  const dataDir = profileData(env);
  const local = relative(ctx.home, dataDir);
  assert.ok(
    local && !local.startsWith(".." + sep) && local !== "..",
    "CLI profile escaped the private home",
  );
  const state: State = {
    binary: join(payloadFor(ctx.exe), process.platform === "win32" ? "raypx.exe" : "raypx"),
    dataDir,
    env,
    close: async () => {},
  };
  owned.set(ctx.home, state);
  return state;
}
async function enroll(state: State) {
  const fixture = await enrollTestProfile(
    { dataDir: state.dataDir, profile: "strobe" },
    [state.binary],
    state.env,
  );
  state.close = fixture.close;
  await mkdir(state.env.RAYPX_HOME!, { recursive: true, mode: 0o700 });
  await writeFile(
    join(state.env.RAYPX_HOME!, "config.toml"),
    `base_url = ${JSON.stringify(fixture.origin)}\nlocal_profile = "strobe"\n`,
    { mode: 0o600 },
  );
}
async function daemon(state: State, action: string) {
  const child = Bun.spawn(
    [state.binary, "daemon", action, "--data-dir", state.dataDir, "--profile", "strobe", "--json"],
    { env: state.env, stdout: "pipe", stderr: "pipe", timeout: 90_000 },
  );
  const [output, , code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(code, 0, `Owned daemon ${action} failed`);
  return output;
}
export async function beforeLaunch(ctx: LaunchContext<unknown>, enrolled: boolean, hot = false) {
  const state = await stateFor(ctx);
  if (enrolled) await enroll(state);
  else {
    await mkdir(state.env.RAYPX_HOME!, { recursive: true });
    await writeFile(
      join(state.env.RAYPX_HOME!, "config.toml"),
      'base_url = "http://127.0.0.1:9"\nlocal_profile = "strobe"\n',
    );
  }
  if (hot) await daemon(state, "start");
}
/** Generate only synthetic enrolled data. Each run block copies it into Strobe's own fresh home. */
export async function createSeed(root: string, exe: string) {
  const parent = join(root, ".artifacts/performance");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const home = await mkdtemp(join(parent, "seed-"));
  const env = performanceEnvironment(process.env, home);
  const payload = payloadFor(exe);
  await verifyCliPayload(payload);
  const state: State = {
    binary: join(payload, process.platform === "win32" ? "raypx.exe" : "raypx"),
    dataDir: profileData(env),
    env,
    close: async () => {},
  };
  try {
    await enroll(state);
  } catch (error) {
    await rm(home, { recursive: true, force: true });
    throw error;
  }
  // The signed receipt remains valid offline; no server or credential is shared with a user.
  await state.close();
  return { home, close: () => rm(home, { recursive: true, force: true }) };
}
async function daemonInfo(state: State) {
  const endpoint = await Bun.file(join(state.dataDir, "profiles/strobe/daemon.json")).json();
  const response = await fetch(
    endpoint.socket ? "http://localhost/info" : `http://127.0.0.1:${endpoint.port}/info`,
    {
      ...(endpoint.socket ? { unix: endpoint.socket } : { proxy: false }),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: { authorization: `Bearer ${endpoint.token}` },
    },
  );
  assert.equal(response.status, 200, "Owned daemon handshake failed");
  const info = (await response.json()) as {
    pid: number;
    epoch: string;
    builtAt: number;
    version: string;
  };
  assert.equal(info.epoch, endpoint.epoch, "Owned daemon epoch changed");
  assert.ok(Number.isSafeInteger(info.pid) && info.pid > 0, "Owned daemon PID is unavailable");
  return info;
}
export async function recordOwnership(ctx: Context<unknown>) {
  if (!ctx.home) return;
  const state = owned.get(ctx.home) ?? (await stateFor(ctx));
  const endpoint = join(state.dataDir, "profiles/strobe/daemon.json");
  const data = (await Bun.file(endpoint).exists()) ? await daemonInfo(state) : null;
  if (data?.pid) process.kill(data.pid, 0);
  const evidence = process.env.RAYPX_STROBE_EVIDENCE;
  if (evidence) {
    await mkdir(evidence, { recursive: true, mode: 0o700 });
    await writeFile(
      join(evidence, crypto.randomUUID() + ".json"),
      JSON.stringify({
        case: ctx.case,
        variant: ctx.variant,
        owner: ctx.env?.STROBE_OWNER,
        daemon: data
          ? { pid: data.pid, epoch: data.epoch, builtAt: data.builtAt, version: data.version }
          : null,
      }),
      { mode: 0o600 },
    );
  }
}
export async function teardown(ctx: Context<unknown>) {
  if (!ctx.home) return;
  const state = owned.get(ctx.home);
  if (!state) return;
  try {
    const endpoint = join(state.dataDir, "profiles/strobe/daemon.json");
    if (await Bun.file(endpoint).exists()) {
      if (
        ctx.case === "idle-five-seconds" &&
        ctx.target === "native" &&
        process.env.RAYPX_STROBE_RECORD_DAEMON === "1"
      ) {
        const { pid, epoch } = await daemonInfo(state);
        const lock = join(state.env.RAYPX_DESKTOP_DATA_DIR!, "desktop-instance.sqlite");
        const available = () => {
          const db = new Database(lock, { readonly: false });
          try {
            db.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE; ROLLBACK");
            return true;
          } catch {
            return false;
          } finally {
            db.close();
          }
        };
        assert.equal(available(), false, "GUI instance lock was not held before Quit");
        const quitSelector = process.env.RAYPX_STROBE_QUIT_SELECTOR;
        if (quitSelector) await ctx.page.act(quitSelector, "invoke");
        else if (process.platform === "darwin") await ctx.page.press("Meta+q");
        else
          throw new Error(
            "A verified native Quit selector is required on Windows; closing a window only hides it",
          );
        const quitDeadline = performance.now() + 45_000;
        while (!available()) {
          assert.ok(performance.now() < quitDeadline, "GUI Quit did not release its instance lock");
          await Bun.sleep(50);
        }
        await Bun.sleep(1000);
        process.kill(pid, 0);
        const after = await daemonInfo(state);
        assert.equal(after.epoch, epoch, "GUI exit replaced the daemon");
        assert.equal(after.pid, pid, "GUI exit stopped the daemon");
        const tool = process.env.RAYPX_STROBE_BIN;
        assert.ok(tool, "Strobe recorder path is required");
        const recorder = Bun.spawn(
          [
            process.execPath,
            tool,
            "record",
            "pid:" + pid,
            "--for",
            "5s",
            "--probes",
            "timing",
            "--json",
          ],
          { env: performanceEnvironment(process.env), stdout: "pipe", stderr: "pipe" },
        );
        const [stdout, stderr, code] = await Promise.all([
          new Response(recorder.stdout).text(),
          new Response(recorder.stderr).text(),
          recorder.exited,
        ]);
        await writeFile(
          join(process.env.RAYPX_STROBE_EVIDENCE!, "daemon-" + crypto.randomUUID() + ".json"),
          JSON.stringify({
            pid,
            code,
            stdout,
            stderr,
            scope:
              "independent daemon after native Quit and instance lock release; excluded from GUI idle metric",
          }),
          { mode: 0o600 },
        );
        assert.equal(code, 0, "Independent daemon recording failed or refused");
      }
      await daemon(state, "stop");
      const deadline = performance.now() + 45_000;
      while (
        await access(endpoint).then(
          () => true,
          () => false,
        )
      ) {
        assert.ok(performance.now() < deadline, "Owned daemon did not release its endpoint");
        await Bun.sleep(25);
      }
    }
  } finally {
    try {
      if (await Bun.file(join(state.dataDir, "profiles/strobe/daemon.json")).exists())
        await daemon(state, "stop");
    } finally {
      try {
        await state.close();
      } finally {
        owned.delete(ctx.home);
      }
    }
  }
}
