import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const releaseMetadataFile = "raypx-release.json";
export type ReleaseSurface = "web" | "desktop";

function validateRelease(release: string): string {
  if (!release.trim() || release.length > 200)
    throw new Error("Invalid application release identifier");
  for (let index = 0; index < release.length; index++) {
    const code = release.charCodeAt(index);
    if (code < 32 || code === 127) throw new Error("Invalid application release identifier");
  }
  return release;
}

export function resolveRelease(
  root: string,
  environment: Record<string, string | undefined>,
  purpose: "build" | "development" | "verification" = "build",
): string {
  let release = environment.VITE_APP_RELEASE || environment.RAILWAY_GIT_COMMIT_SHA;
  if (!release && purpose === "verification") release = "verification";
  if (!release) {
    try {
      release = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      if (purpose !== "development")
        throw new Error(
          "Set VITE_APP_RELEASE or RAILWAY_GIT_COMMIT_SHA when building outside a Git checkout",
        );
      release = "development";
    }
  }
  return validateRelease(release);
}

/** Read the version actually embedded in the assets, independently of the current checkout. */
export function readBuiltRelease(directory: string, surface: ReleaseSurface): string {
  let metadata: { version?: unknown; surface?: unknown; release?: unknown };
  try {
    metadata = JSON.parse(readFileSync(join(directory, releaseMetadataFile), "utf8"));
  } catch {
    throw new Error(
      "Build release metadata is missing or invalid; rebuild this target before uploading source maps",
    );
  }
  if (
    metadata?.version !== 1 ||
    metadata.surface !== surface ||
    typeof metadata.release !== "string"
  )
    throw new Error("Build release metadata does not match the requested target");
  return validateRelease(metadata.release);
}
