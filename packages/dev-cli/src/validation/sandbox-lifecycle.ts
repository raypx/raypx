import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

/** Extra real-Engine cases run in a child with disposable state and the gate's exact labels. */
export async function acceptSandboxLifecycle(env: NodeJS.ProcessEnv) {
  const root = env.SANDBOX_VALIDATION_ROOT!;
  const parent = env.SANDBOX_STATE_DIRECTORY!;
  const token = env.SANDBOX_SUPERVISOR_TOKEN!;
  const url = `http://127.0.0.1:${env.SANDBOX_PORT}`;
  const owner = `${env.SANDBOX_NAMESPACE}-computers`;
  const dockerArgs = ["docker", "--host", `unix://${env.SANDBOX_ENGINE_SOCKET}`];
  let child: ReturnType<typeof Bun.spawn> | undefined;
  const directories: string[] = [];
  let state = "";
  const base = {
    ...env,
    SANDBOX_GRAPHICAL: "false",
    SANDBOX_NETWORK_LIMITS: "false",
    SANDBOX_UNTRUSTED_TENANTS: "false",
    SANDBOX_REAP_MS: "1000",
    SANDBOX_IDLE_MS: "60000",
    SANDBOX_MAX_LIFETIME_MS: "60000",
  };
  async function docker(args: string[], allowFailure = false) {
    const process = Bun.spawn([...dockerArgs, ...args], { stdout: "pipe", stderr: "ignore" });
    const output = await new Response(process.stdout).text();
    const code = await process.exited;
    if (code && !allowFailure) throw new Error("Lifecycle Engine operation failed");
    return { code, output: output.trim() };
  }
  async function request(id: string, operation: string, body: object = {}) {
    return fetch(`${url}/computers/${id}/${operation}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ generation: 1, ...body }),
      signal: AbortSignal.timeout(30000),
    });
  }
  async function call(id: string, operation: string, body: object = {}) {
    const response = await request(id, operation, body);
    if (!response.ok) throw new Error(`Lifecycle ${operation} refused (${response.status})`);
    return response.json();
  }
  async function refused(id: string, spaceId: string, expected: string) {
    const response = await request(id, "create", { spaceId });
    const result = (await response.json()) as { code?: string };
    if (response.ok || result.code !== expected)
      throw new Error(`Lifecycle admission did not return ${expected}`);
  }
  async function stop() {
    if (!child) return;
    child.kill("SIGKILL");
    await child.exited;
    child = undefined;
  }
  function launch(settings: NodeJS.ProcessEnv) {
    child = Bun.spawn(
      [process.execPath, "--no-env-file", join(root, "infra/sandbox/src/main.ts")],
      {
        env: settings,
        stdout: "ignore",
        stderr: "ignore",
      },
    );
    return child;
  }
  async function ready(settings: NodeJS.ProcessEnv, reuse = false) {
    await stop();
    if (!reuse) {
      state = await mkdtemp(join(parent, "lifecycle-"));
      directories.push(state);
    }
    const process = launch({ ...base, ...settings, SANDBOX_STATE_DIRECTORY: state });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (process.exitCode !== null)
        throw new Error("Lifecycle supervisor exited before readiness");
      try {
        const response = await fetch(`${url}/description`, {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(500),
        });
        if (response.ok) return;
      } catch {
        /* listener is not open yet */
      }
      await Bun.sleep(200);
    }
    throw new Error("Lifecycle supervisor readiness timed out");
  }
  async function stopped(id: string, reason: string) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await call(id, "get"); // Reads must not refresh activity.
      const row = JSON.parse(await readFile(join(state, `${id}.json`), "utf8")) as {
        state: string;
        stopReason: string;
        container: string;
      };
      if (row.state === "stopped" && row.stopReason === reason) {
        const result = await docker(["inspect", "--format", "{{.State.Running}}", row.container]);
        if (result.output !== "false")
          throw new Error("Automatic stop left Engine compute running");
        return;
      }
      await Bun.sleep(200);
    }
    throw new Error(`Lifecycle ${reason} stop timed out`);
  }
  async function check(label: string, operation: () => Promise<void>) {
    await operation();
    console.log(`${label}: passed`);
  }
  try {
    await check("startup-policy-refusal", async () => {
      for (const settings of [
        { SANDBOX_RUNTIME: "raypx-missing-runtime" },
        {
          SANDBOX_UNTRUSTED_TENANTS: "true",
          SANDBOX_NETWORK_LIMITS: "true",
          SANDBOX_RUNTIME: "runc",
          SANDBOX_ALLOW_DEFAULT_RUNTIME: "false",
          SANDBOX_RESTRICTED_EGRESS: "true",
          SANDBOX_HOST_RULES_APPLIED: "true",
        },
        { SANDBOX_UNTRUSTED_TENANTS: "true", SANDBOX_NETWORK_LIMITS: "false" },
      ]) {
        const process = launch({ ...base, ...settings });
        const code = await Promise.race([process.exited, Bun.sleep(5000).then(() => null)]);
        if (code === null || code === 0) throw new Error("Unsafe startup policy opened admission");
        child = undefined;
      }
    });
    await check("quota-admission", async () => {
      await ready({
        SANDBOX_SPACE_RUNNING: "1",
        SANDBOX_DEPLOYMENT_RUNNING: "2",
        SANDBOX_SPACE_STORAGE_BYTES: "100663296",
        SANDBOX_DEPLOYMENT_STORAGE_BYTES: "201326592",
      });
      const a = crypto.randomUUID();
      const b = crypto.randomUUID();
      await call(a, "create", { spaceId: "lifecycle-a" });
      await refused(crypto.randomUUID(), "lifecycle-a", "SPACE_RUNNING_LIMIT");
      await call(b, "create", { spaceId: "lifecycle-b" });
      await refused(crypto.randomUUID(), "lifecycle-c", "DEPLOYMENT_RUNNING_LIMIT");
      await call(a, "stop");
      await refused(crypto.randomUUID(), "lifecycle-a", "SPACE_STORAGE_LIMIT");
      await refused(crypto.randomUUID(), "lifecycle-c", "DEPLOYMENT_STORAGE_LIMIT");
    });
    await check("idle-stop", async () => {
      await ready({ SANDBOX_IDLE_MS: "10000" });
      const id = crypto.randomUUID();
      await call(id, "create", { spaceId: "lifecycle-idle" });
      await stopped(id, "idle");
    });
    await check("lifetime-stop", async () => {
      await ready({ SANDBOX_MAX_LIFETIME_MS: "10000" });
      const id = crypto.randomUUID();
      await call(id, "create", { spaceId: "lifecycle-lifetime" });
      const response = await request(id, "exec", {
        executionId: crypto.randomUUID(),
        command: {
          executable: "sleep",
          argv: ["60"],
          cwd: ".",
          environment: {},
          outputBudget: 1024,
        },
      });
      if (!response.ok) throw new Error("Lifetime command did not start");
      const drained = response.text();
      await stopped(id, "lifetime");
      await drained;
    });
    await check("crash-orphan-reaping", async () => {
      await ready({});
      const id = crypto.randomUUID();
      await call(id, "create", { spaceId: "lifecycle-crash" });
      await stop(); // SIGKILL leaves live Engine compute and durable running metadata.
      const orphan = (
        await docker([
          "run",
          "--detach",
          "--runtime",
          env.SANDBOX_RUNTIME!,
          "--network",
          "none",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges:true",
          "--memory",
          "134217728",
          "--pids-limit",
          "128",
          "--label",
          `raypx.supervisor=${owner}`,
          "--label",
          "raypx.role=computer",
          "--log-driver",
          "none",
          env.SANDBOX_COMPUTER_IMAGE!,
          "sleep",
          "infinity",
        ])
      ).output;
      const volume = (await docker(["volume", "create", "--label", `raypx.supervisor=${owner}`]))
        .output;
      await ready({}, true);
      await stopped(id, "engine");
      if (
        !(await docker(["inspect", orphan], true)).code ||
        !(await docker(["volume", "inspect", volume], true)).code
      )
        throw new Error("Owned orphan resources survived recovery");
    });
  } finally {
    await stop();
    // The parent gate removes all exact-label resources before removing its own state.
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) await acceptSandboxLifecycle(process.env);
