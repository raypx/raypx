import { join } from "node:path";
import { probeArtifact } from "../repo/artifact.js";
import { checkApi, checkWeb } from "./checks.js";

function probeApp(
  root: string,
  app: "api" | "web",
  environment: (base: string) => Record<string, string>,
  check: (base: string) => Promise<void>,
): Promise<void> {
  return probeArtifact({
    name: app,
    output: join(root, "apps", app, ".output"),
    node: process.execPath,
    environment,
    check,
    failOnOutput: ["Error in renderToReadableStream"],
  });
}

export async function probeApi(root: string): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !/^\/[a-z0-9_]+_test(?:_[a-z0-9]+)?$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      throw new Error("Artifact PostgreSQL must be an explicit disposable loopback test database");
  }
  for (const role of ["api", "all"] as const) {
    try {
      await probeApp(
        root,
        "api",
        (base) => ({
          NODE_ENV: "test",
          SERVER_ROLE: role,
          DATABASE_MIGRATE_ON_START: "false",
          DATABASE_URL: databaseUrl ?? "postgres://raypx:raypx@127.0.0.1:1/raypx_artifact_test",
          AUTH_URL: base,
          AUTH_SECRET: "raypx-artifact-test-secret-32-characters",
          APP_KEY: "raypx-artifact-test-app-key-32-characters",
          ALLOWED_ORIGINS: base,
        }),
        async (base) => {
          if (!databaseUrl) throw new Error("API unexpectedly started without PostgreSQL");
          await checkApi(base);
          if (!(await fetch(`${base}/ready`)).ok)
            throw new Error("API artifact dependencies are not ready");
        },
      );
    } catch (error) {
      // Session event subscriptions require PostgreSQL. Offline source verification
      // accepts only the explicit sanitized refusal, never an arbitrary bundle failure.
      if (
        databaseUrl ||
        !(error instanceof Error) ||
        !error.message.startsWith("api exited during startup:") ||
        !error.message.includes(
          "Backend startup failed. Check runtime role, configuration, database availability and migrations.",
        ) ||
        /postgres:\/\/|raypx-artifact-test-(?:secret|app-key)/.test(error.message)
      )
        throw error;
    }
  }
  await probeRelay(root, databaseUrl);
  console.log(
    databaseUrl
      ? "Bun backend artifact probe passed (relocated api/all routes and relay dependency refusal)"
      : "Bun backend artifact probe passed (relocated api/all PostgreSQL startup refusal and relay boundary)",
  );
}

export async function probeWeb(root: string): Promise<void> {
  await probeApp(root, "web", () => ({ NODE_ENV: "production" }), checkWeb);
  console.log("Bun Web artifact probe passed (relocated output, SSR locale, assets, 404s)");
}

async function probeRelay(root: string, databaseUrl?: string): Promise<void> {
  await probeArtifact({
    name: "relay",
    output: join(root, "apps/api/.output"),
    node: process.execPath,
    environment: (base) => ({
      NODE_ENV: "test",
      SERVER_ROLE: "relay",
      DATABASE_URL: databaseUrl ?? "postgres://raypx:raypx@127.0.0.1:1/raypx_artifact_test",
      REDIS_URL: "redis://127.0.0.1:1",
      ALLOWED_ORIGINS: base,
    }),
    async check(base) {
      // Dependencies are deliberately unavailable; liveness must remain usable.
      const ready = await fetch(`${base}/ready`);
      if (ready.status !== 503 || (await ready.text()).includes("postgres://"))
        throw new Error("Relay artifact must report dependency unavailability safely");
      if ((await fetch(`${base}/device/connect`)).status !== 426)
        throw new Error("Connector endpoint must require an authenticated upgrade");
      for (const path of ["/rpc/__missing", "/api/docs", "/api/docs/assets/swagger-ui-bundle.js"]) {
        if ((await fetch(`${base}${path}`)).status !== 404)
          throw new Error(`Relay artifact must not expose ${path}`);
      }
    },
  });
  console.log(
    "Bun Relay artifact probe passed (relocated bundle, liveness, readiness, private boundary)",
  );
}
