import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Evidence, type ValidationProcess } from "./evidence.js";

export function backendEnvironment(
  source: NodeJS.ProcessEnv,
  databaseURL: string,
  redisURL?: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...source,
    TEST_DATABASE_URL: databaseURL,
    DATABASE_URL: databaseURL,
    RAYPX_LIVE_AGENTS: "0",
  };
  // Keep validation switches separate from Vite/React's reserved NODE_ENV.
  delete env.NODE_ENV;
  delete env.REDIS_URL;
  delete env.TEST_REDIS_URL;
  if (redisURL) Object.assign(env, { REDIS_URL: redisURL, TEST_REDIS_URL: redisURL });
  return env;
}

function executable(name: string, directory?: string) {
  const value = Bun.which(directory ? join(directory, name) : name);
  if (!value) throw new Error(`Missing ${name}; configure TEST_POSTGRES_BIN or PATH`);
  return value;
}
async function freePort() {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
  const port = server.port!;
  await server.stop(true);
  return port;
}
async function ready(evidence: Evidence, child: ValidationProcess, probe: () => Promise<boolean>) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    evidence.check();
    if (!child.alive()) throw new Error(`Validation service exited; see ${evidence.directory}`);
    if (await probe()) return;
    await Bun.sleep(100);
  }
  throw new Error(`Validation service startup timed out; see ${evidence.directory}`);
}

export function backendPlan(args: string[]) {
  const separator = args.indexOf("--");
  const flags = separator < 0 ? args : args.slice(0, separator);
  const browserArgs = separator < 0 ? [] : args.slice(separator + 1);
  const { values } = parseArgs({
    args: flags,
    strict: true,
    options: {
      "with-e2e": { type: "boolean", default: false },
      "database-url": { type: "string" },
    },
  });
  if (browserArgs.length > 0 && !values["with-e2e"])
    throw new Error("Browser flags require --with-e2e");
  const databaseURL = values["database-url"];
  if (databaseURL !== undefined) {
    try {
      const url = new URL(databaseURL);
      if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        !/^\/[a-z0-9_]+_test(?:_[a-z0-9]+)?$/.test(url.pathname) ||
        url.search ||
        url.hash
      )
        throw new Error();
    } catch {
      throw new Error(
        "--database-url must name a disposable loopback *_test or *_test_<lane> database without query options",
      );
    }
  }
  return { databaseURL, withE2E: values["with-e2e"], browserArgs };
}

/** Provision owned services, or use only an explicitly selected disposable local database. */
export async function validateBackends(root: string, args: string[]) {
  if (process.platform === "win32")
    throw new Error("Local backend provisioning currently requires POSIX");
  const plan = backendPlan(args);
  const redisBinary = Bun.which(process.env.TEST_REDIS_BINARY ?? "redis-server");
  if (!redisBinary) throw new Error("Missing redis-server; configure TEST_REDIS_BINARY or PATH");
  const evidence = new Evidence(root, "backends");
  await evidence.run(async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-validation-"));
    try {
      let url = plan.databaseURL;
      if (!url) {
        const pg = Object.fromEntries(
          ["initdb", "postgres", "pg_isready", "createdb"].map((name) => [
            name,
            executable(name, process.env.TEST_POSTGRES_BIN),
          ]),
        );
        const password = crypto.randomUUID();
        const passwordFile = join(directory, "password");
        const data = join(directory, "postgres");
        await writeFile(passwordFile, password, { mode: 0o600 });
        await evidence.command("postgres-init", [
          pg.initdb!,
          "-D",
          data,
          "-A",
          "scram-sha-256",
          "--pwfile",
          passwordFile,
          "-U",
          "raypx_validation",
          "--no-locale",
          "--encoding=UTF8",
        ]);
        const port = await freePort();
        const postgres = evidence.start("postgres-server", [
          pg.postgres!,
          "-D",
          data,
          "-h",
          "127.0.0.1",
          "-p",
          String(port),
          "-k",
          "",
        ]);
        await ready(
          evidence,
          postgres,
          async () =>
            Bun.spawnSync(
              [pg.pg_isready!, "-h", "127.0.0.1", "-p", String(port), "-U", "raypx_validation"],
              { stdout: "ignore", stderr: "ignore" },
            ).exitCode === 0,
        );
        await evidence.command(
          "postgres-create",
          [
            pg.createdb!,
            "-h",
            "127.0.0.1",
            "-p",
            String(port),
            "-U",
            "raypx_validation",
            "raypx_validation_test",
          ],
          { ...process.env, PGPASSWORD: password },
        );
        url = `postgres://raypx_validation:${password}@127.0.0.1:${port}/raypx_validation_test`;
      }
      let redisURL: string | undefined;
      if (redisBinary) {
        const redisPort = await freePort();
        const redis = evidence.start("redis-server", [
          redisBinary,
          "--bind",
          "127.0.0.1",
          "--port",
          String(redisPort),
          "--dir",
          directory,
          "--save",
          "",
          "--appendonly",
          "no",
        ]);
        await ready(evidence, redis, async () => {
          try {
            const connection = await Bun.connect({
              hostname: "127.0.0.1",
              port: redisPort,
              socket: {
                data() {},
                open(socket) {
                  socket.end();
                },
              },
            });
            connection.end();
            return true;
          } catch {
            return false;
          }
        });
        redisURL = `redis://127.0.0.1:${redisPort}/0`;
      }
      const env = backendEnvironment(process.env, url, redisURL);
      const cli = join(root, "packages/dev-cli/src/cli.ts");
      for (const task of ["test:postgres", "test:redis", "test:cluster"]) {
        const label = task.replaceAll(":", "-");
        const report = `backend-${evidence.id}-${label}.json`;
        await evidence.command(
          label,
          [
            process.execPath,
            "--no-env-file",
            cli,
            "tasks",
            `api#${task}`,
            "--",
            "--reporter=json",
            `--outputFile=node_modules/.cache/raypx-tests/${report}`,
          ],
          env,
        );
        await copyFile(
          join(root, "apps/api/node_modules/.cache/raypx-tests", report),
          join(evidence.directory, `${label}.json`),
        );
      }
      if (plan.withE2E) {
        const apiPort = await freePort(),
          apiUrl = `http://127.0.0.1:${apiPort}`;
        const api = evidence.start(
          "control-api",
          [
            process.execPath,
            "--no-env-file",
            join(root, "apps/api/tests/helpers/control-server.ts"),
          ],
          { ...env, RAYPX_VALIDATION: "1", CONTROL_E2E_PORT: String(apiPort) },
        );
        await ready(evidence, api, async () => {
          try {
            return (await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(300) })).ok;
          } catch {
            return false;
          }
        });
        await evidence.command(
          "e2e",
          [
            process.execPath,
            "--no-env-file",
            cli,
            "e2e",
            "--",
            "--reporter=list,json",
            ...plan.browserArgs,
          ],
          {
            ...env,
            VITE_API_URL: apiUrl,
            VITE_WEB_URL: "http://127.0.0.1:4173",
            CONTROL_E2E_API_URL: apiUrl,
            PLAYWRIGHT_JSON_OUTPUT_FILE: join(evidence.directory, "e2e.json"),
          },
        );
      }
    } finally {
      // Stop every owned process even after one gate fails. Never remove live server data.
      await evidence.stopAll();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
