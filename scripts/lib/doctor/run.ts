import { resolve } from "node:path";
import { checkLocalEnvironment } from "./local-checks.ts";
import type { RuntimeConfiguration } from "./local-checks.ts";
import { databaseCheck, origin, probeService } from "./probes.ts";
import { createDoctorReport } from "./report.ts";
import type { DoctorCheck, DoctorOptions, DoctorReport } from "./report.ts";

function requestedDatabaseCheck(
  options: DoctorOptions,
  root: string,
  environment: DoctorOptions["environment"],
  configuration: RuntimeConfiguration | undefined,
): DoctorCheck {
  if (options.database && configuration) {
    const path = configuration.DATABASE_PATH ?? "./data/raypx.db";
    return path === ":memory:"
      ? {
          id: "database",
          status: "skipped",
          code: "DATABASE_IN_MEMORY",
          message: "An in-memory database cannot be inspected from a separate diagnostic process.",
        }
      : databaseCheck(root, path, environment);
  } else {
    return {
      id: "database",
      status: "skipped",
      code: "DATABASE_NOT_PROBED",
      message: configuration?.AUTH_ENABLED
        ? "Authentication is configured; its database was not opened by this local check."
        : "No database probe was requested.",
      fix: "Use bun run doctor --database to verify an existing database without migrating it.",
    };
  }
}

async function requestedServiceCheck(
  options: DoctorOptions,
  root: string,
  installed: boolean,
): Promise<DoctorCheck> {
  return options.probe && installed
    ? await probeService(
        root,
        origin(options.probe) ??
          (() => {
            throw new Error("Invalid probe origin");
          })(),
      )
    : options.probe
      ? {
          id: "service",
          status: "skipped",
          code: "PROBE_VALIDATION_UNAVAILABLE",
          message: "Network probes require installed response contract dependencies.",
        }
      : {
          id: "service",
          status: "skipped",
          code: "SERVICE_NOT_PROBED",
          message: "No network probe was requested.",
        };
}

/** Runs local diagnostics without installing, building, migrating, or starting the application. */
export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const root = resolve(options.root);
  const environment = options.environment ?? process.env;
  const local = await checkLocalEnvironment(root, environment);
  local.checks.push(requestedDatabaseCheck(options, root, environment, local.configuration));
  local.checks.push(await requestedServiceCheck(options, root, local.installed));
  return createDoctorReport(local.checks);
}
