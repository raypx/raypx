import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { DoctorCheck, DoctorOptions } from "./report.ts";

const timeoutMs = 5000;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Accepts only a credential-free HTTP(S) origin for the diagnostic CLI. */
export function origin(input: string): string | undefined {
  try {
    const url = new URL(input);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

async function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error("Diagnostic deadline exceeded"));
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

async function responseBody(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error("Missing body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const result = await bounded(reader.read(), signal);
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 64 * 1024) throw new Error("Probe body too large");
      chunks.push(result.value);
    }
  } finally {
    // Cancellation is advisory; an uncooperative response must not extend the deadline.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/** Checks shared health/readiness contracts under one bounded deadline. */
export async function probeService(root: string, target: string): Promise<DoctorCheck> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const { healthResponseSchema, readinessResponseSchema } = (await import(
      pathToFileURL(join(root, "packages/contracts/src/health.ts")).href
    )) as {
      healthResponseSchema: { parse(input: unknown): { status: "ok"; service: "raypx-api" } };
      readinessResponseSchema: {
        parse(input: unknown): {
          status: "ok" | "unavailable";
          service: "raypx-api";
          checks: Record<string, "ok" | "failed">;
        };
      };
    };
    let degraded = false;
    for (const route of ["/api/health", "/api/ready"]) {
      const response = await bounded(
        fetch(`${target}${route}`, {
          signal,
          redirect: "error",
          headers: { accept: "application/json" },
        }),
        signal,
      );
      const input = await responseBody(response, signal);
      const body =
        route === "/api/ready"
          ? readinessResponseSchema.parse(input)
          : healthResponseSchema.parse(input);
      if (response.status !== 200 || body.status !== "ok") throw new Error("Probe unavailable");
      if (route === "/api/ready") {
        degraded = Object.values(readinessResponseSchema.parse(input).checks).some(
          (value) => value === "failed",
        );
      }
    }
    return {
      id: "service",
      status: degraded ? "warning" : "ok",
      code: degraded ? "SERVICE_DEGRADED" : "SERVICE_READY",
      message: degraded
        ? "The service is ready, with a failed optional dependency check."
        : "Liveness and readiness probes passed.",
    };
  } catch {
    return {
      id: "service",
      status: "error",
      code: signal.aborted ? "PROBE_TIMEOUT" : "PROBE_FAILED",
      message: "Service probes failed or did not respond within five seconds.",
      fix: "Start the application and inspect its local runtime logs.",
    };
  }
}

/** Checks an existing database in an isolated read-only Bun process. */
export function databaseCheck(
  root: string,
  path: string,
  environment: DoctorOptions["environment"],
): DoctorCheck {
  const result = spawnSync(
    "bun",
    [
      "--no-install",
      "--no-env-file",
      fileURLToPath(new URL("../../doctor-database.ts", import.meta.url)),
    ],
    {
      cwd: join(root, "apps/web"),
      encoding: "utf8",
      env: {
        PATH: environment?.PATH ?? process.env.PATH,
        RAYPX_DOCTOR_ROOT: root,
        DATABASE_PATH: path,
      },
      timeout: timeoutMs,
      maxBuffer: 4096,
    },
  );
  let code = "DATABASE_CHECK_FAILED";
  try {
    const parsed = record(JSON.parse(result.stdout) as unknown);
    const codes = [
      "DATABASE_READY",
      "DATABASE_MISSING",
      "DATABASE_SCHEMA_MISSING",
      "DATABASE_MIGRATIONS_PENDING",
      "DATABASE_CHECK_FAILED",
    ];
    if (typeof parsed.code === "string" && codes.includes(parsed.code)) code = parsed.code;
  } catch {
    // Child errors, paths, and driver messages never become report output.
  }
  return code === "DATABASE_READY" && result.status === 0
    ? {
        id: "database",
        status: "ok",
        code,
        message: "Existing database schema and migrations are ready.",
      }
    : {
        id: "database",
        status: "error",
        code,
        message: "The existing database could not be verified as ready.",
        fix: "Check DATABASE_PATH and run bun run db:migrate before enabling authentication.",
      };
}
