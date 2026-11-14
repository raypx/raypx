import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

/** Operator-only capacity probe against an explicitly prepared standalone supervisor. */
export async function sandboxCapacity(args: string[], env = process.env) {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      url: { type: "string" },
      limit: { type: "string" },
      screens: { type: "string", default: "0" },
      output: { type: "string" },
    },
  });
  const limit = Number(values.limit);
  const screens = Number(values.screens);
  const url = new URL(values.url!);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "10.77.0.2"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("Capacity requires an explicit local/private standalone supervisor URL");
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 64 ||
    !Number.isInteger(screens) ||
    screens < 0 ||
    screens > limit ||
    !values.output
  )
    throw new Error("Capacity requires --limit 1..64, --screens 0..limit and --output");
  const token = env.SANDBOX_SUPERVISOR_TOKEN;
  if (!token || token.length < 32 || !env.SANDBOX_NAMESPACE)
    throw new Error("Prepared supervisor environment required");
  const owner = `${env.SANDBOX_NAMESPACE}-computers`;
  const ids: string[] = [];
  const starts: number[] = [];
  const screenStarts: number[] = [];
  async function call(id: string, operation: string, body: object = {}, expected?: string) {
    const response = await fetch(new URL(`computers/${id}/${operation}`, url), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ generation: 1, ...body }),
      signal: AbortSignal.timeout(60000),
    });
    const result = (await response.json()) as { code?: string };
    if (expected) {
      if (response.ok || result.code !== expected)
        throw new Error(`Capacity admission did not return ${expected}`);
    } else if (!response.ok)
      throw new Error(`Capacity ${operation} refused (${response.status}, ${result.code})`);
    return result;
  }
  async function docker(argv: string[]) {
    const child = Bun.spawn(["docker", "--host", `unix://${env.SANDBOX_ENGINE_SOCKET}`, ...argv], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const value = await new Response(child.stdout).text();
    if (await child.exited) throw new Error("Capacity Engine observation failed");
    return value.trim();
  }
  async function cpu() {
    const row = (await readFile("/proc/stat", "utf8"))
      .split("\n")[0]!
      .trim()
      .split(/\s+/)
      .slice(1)
      .map(Number);
    return { total: row.slice(0, 8).reduce((a, b) => a + b, 0), idle: row[3]! + row[4]! };
  }
  async function observe() {
    const memory = Object.fromEntries(
      (await readFile("/proc/meminfo", "utf8"))
        .trim()
        .split("\n")
        .map((row) => {
          const [key, number] = row.split(/:\s*/);
          return [key, Number(number!.split(/\s+/)[0]) * 1024];
        }),
    );
    const containers = (
      await docker([
        "ps",
        "--quiet",
        "--filter",
        `label=raypx.supervisor=${owner}`,
        "--filter",
        "label=raypx.role=computer",
      ])
    )
      .split(/\s+/)
      .filter(Boolean);
    if (containers.length !== limit)
      throw new Error("Capacity Engine count differs from configured admission");
    const stats = (await docker(["stats", "--no-stream", "--format", "{{json .}}", ...containers]))
      .split("\n")
      .map((row) => JSON.parse(row) as { CPUPerc: string; MemUsage: string; PIDs: string });
    const before = await cpu();
    await Bun.sleep(10000);
    const after = await cpu();
    return {
      memoryTotalBytes: memory.MemTotal,
      memoryAvailableBytes: memory.MemAvailable,
      cpuIdlePercent: (100 * (after.idle - before.idle)) / (after.total - before.total),
      tasks: Number((await readFile("/proc/loadavg", "utf8")).split(/\s+/)[3]!.split("/")[1]),
      pidMax: Number(await readFile("/proc/sys/kernel/pid_max", "utf8")),
      containers: stats,
    };
  }
  let failure: unknown;
  const cleanupErrors: unknown[] = [];
  try {
    for (let i = 0; i < limit; i++) {
      const id = crypto.randomUUID();
      ids.push(id);
      const started = performance.now();
      await call(id, "create", { spaceId: `capacity-${id}` });
      starts.push(performance.now() - started);
      if (i < screens) {
        const start = performance.now();
        await call(id, "screen/start");
        screenStarts.push(performance.now() - start);
      }
    }
    await call(
      crypto.randomUUID(),
      "create",
      { spaceId: `capacity-${crypto.randomUUID()}` },
      "DEPLOYMENT_RUNNING_LIMIT",
    );
    const result = {
      limit,
      screens,
      startsMs: starts,
      screenStartsMs: screenStarts,
      admission: "DEPLOYMENT_RUNNING_LIMIT",
      observation: await observe(),
      workload: "idle computers; requested desktop sessions running; ten-second host CPU sample",
    };
    await writeFile(values.output, JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result));
  } catch (error) {
    failure = error;
  } finally {
    const results = await Promise.allSettled(ids.map((id) => call(id, "destroy")));
    for (const result of results)
      if (result.status === "rejected") cleanupErrors.push(result.reason);
  }
  if (cleanupErrors.length)
    throw new AggregateError([failure, ...cleanupErrors], "Capacity cleanup failed");
  if (failure) throw failure;
}
if (import.meta.main) await sandboxCapacity(process.argv.slice(2));
