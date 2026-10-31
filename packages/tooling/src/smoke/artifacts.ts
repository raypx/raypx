import { join } from "node:path";
import { probeArtifact } from "@raypx-kit/devkit/artifact";
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
  await probeApp(
    root,
    "api",
    (base) => ({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://raypx:raypx@127.0.0.1:1/raypx_artifact_test",
      AUTH_URL: base,
      AUTH_SECRET: "raypx-artifact-test-secret-32-characters",
      RESEND_API_KEY: "",
      MAIL_FROM: "",
      ALLOWED_ORIGINS: base,
    }),
    checkApi,
  );
  console.log("Bun API artifact probe passed (relocated output, health, 404s, mail guard, Relay)");
}

export async function probeWeb(root: string): Promise<void> {
  await probeApp(root, "web", () => ({ NODE_ENV: "production" }), checkWeb);
  console.log("Bun Web artifact probe passed (relocated output, SSR locale, assets, 404s)");
}
