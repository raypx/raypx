import { join } from "node:path";
import { probeArtifact } from "@raypx/devkit/artifact";
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
  for (const role of ["api", "both"] as const) {
    await probeApp(
      root,
      "api",
      (base) => ({
        NODE_ENV: "test",
        SERVER_ROLE: role,
        DATABASE_MIGRATE_ON_START: "false",
        DATABASE_URL: "postgres://raypx:raypx@127.0.0.1:1/raypx_artifact_test",
        ...(role === "api" ? { REDIS_URL: "redis://127.0.0.1:1" } : {}),
        AUTH_URL: base,
        AUTH_SECRET: "raypx-artifact-test-secret-32-characters",
        RESEND_API_KEY: "",
        MAIL_FROM: "",
        ALLOWED_ORIGINS: base,
      }),
      (base) => checkApi(base, { relay: role === "both" }),
    );
  }
  await probeRelay(root);
  console.log("Bun backend artifact probe passed (same relocated output, api/both/relay roles)");
}

export async function probeWeb(root: string): Promise<void> {
  await probeApp(root, "web", () => ({ NODE_ENV: "production" }), checkWeb);
  console.log("Bun Web artifact probe passed (relocated output, SSR locale, assets, 404s)");
}

async function probeRelay(root: string): Promise<void> {
  await probeArtifact({
    name: "relay",
    output: join(root, "apps/api/.output"),
    node: process.execPath,
    environment: (base) => ({
      NODE_ENV: "test",
      SERVER_ROLE: "relay",
      DATABASE_URL: "postgres://raypx:raypx@127.0.0.1:1/raypx_artifact_test",
      REDIS_URL: "redis://127.0.0.1:1",
      ALLOWED_ORIGINS: base,
    }),
    async check(base) {
      // Dependencies are deliberately unavailable; liveness must remain usable.
      const ready = await fetch(`${base}/ready`);
      if (ready.status !== 503 || (await ready.text()).includes("postgres://"))
        throw new Error("Relay artifact must report dependency unavailability safely");
      if ((await fetch(`${base}/relay`)).status !== 503)
        throw new Error("Relay artifact must not fall back to process-local routing");
      if ((await fetch(`${base}/rpc/__missing`)).status !== 404)
        throw new Error("Relay artifact must not expose API routes");
    },
  });
  console.log(
    "Bun Relay artifact probe passed (relocated bundle, liveness, readiness, private boundary)",
  );
}
