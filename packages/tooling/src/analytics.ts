import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readBuiltRelease } from "./build/release.js";
import { run } from "@raypx-kit/devkit/process";
export async function uploadAnalyticsMaps(root: string, target: string | undefined) {
  const targets = {
    web: ["apps/web/.output/public/assets", "raypx-web"],
    desktop: ["apps/desktop/dist/client/assets", "raypx-desktop"],
  } as const;
  if (!target || !(target in targets))
    throw new Error("Usage: raypx-dev analytics sourcemaps <web|desktop>");
  if (
    ["POSTHOG_CLI_HOST", "POSTHOG_CLI_PROJECT_ID", "POSTHOG_CLI_API_KEY"].some(
      (key) => !process.env[key],
    )
  )
    throw new Error(
      "Source map upload requires POSTHOG_CLI_HOST, POSTHOG_CLI_PROJECT_ID and POSTHOG_CLI_API_KEY in the release environment.",
    );
  const [relative, name] = targets[target as keyof typeof targets],
    directory = join(root, relative);
  if (!existsSync(directory) || !readdirSync(directory).some((file) => file.endsWith(".js.map")))
    throw new Error(
      "No client source maps found. Build this target with RAYPX_SOURCEMAPS=1 first.",
    );
  const release = readBuiltRelease(directory, target as "web" | "desktop");
  if (process.env.VITE_APP_RELEASE && process.env.VITE_APP_RELEASE !== release)
    throw new Error(
      "VITE_APP_RELEASE differs from the built assets; upload the recorded build release",
    );
  const cli = fileURLToPath(import.meta.resolve("@posthog/cli/run-posthog-cli.js"));
  await run(
    process.execPath,
    [
      cli,
      "sourcemap",
      "inject",
      "--directory",
      directory,
      "--release-name",
      name,
      "--release-version",
      release,
    ],
    root,
  );
  await run(
    process.execPath,
    [
      cli,
      "sourcemap",
      "upload",
      "--directory",
      directory,
      "--release-name",
      name,
      "--release-version",
      release,
      "--delete-after",
    ],
    root,
  );
  console.log("Client source maps uploaded. Publish these injected assets without rebuilding.");
}
