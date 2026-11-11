import { runtimeLease } from "../process/lease.js";
import { cliLaunch, cliInstallation, installRuntimeCopy } from "../process/installation.js";
import { spawnProcess, sleep } from "@raypx/runtime-node/process";
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import manifest from "../../../package.json";
import { cliBuild } from "./build.js";
import { profilePath, acquireLock } from "../state/index.js";
import { LocalError } from "../errors.js";
import { localAddressSchema, localFetch } from "../local-http.js";

export type ProfileOptions = { dataDir?: string; profile?: string };
const daemonEndpointSchema = z
  .object({
    protocol: z.literal(1),
    version: z.string(),
    builtAt: z.number().int().nonnegative(),
    epoch: z.string().uuid(),
    token: z.string().min(64).max(200),
  })
  .and(localAddressSchema);
export type DaemonEndpoint = z.infer<typeof daemonEndpointSchema>;
export const endpointFile = (directory: string) => join(directory, "daemon.json");
export function readDaemon(directory: string) {
  return daemonEndpointSchema.parse(JSON.parse(readFileSync(endpointFile(directory), "utf8")));
}
export function daemonFetch(
  endpoint: DaemonEndpoint,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  return localFetch(endpoint, path, {
    headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
}
async function probe(directory: string, purpose: "connect" | "stop" = "connect") {
  let endpoint: DaemonEndpoint;
  try {
    endpoint = readDaemon(directory);
  } catch {
    return;
  }
  let response: Response;
  try {
    response = await daemonFetch(endpoint, "/info", undefined, AbortSignal.timeout(500));
  } catch {
    return;
  }
  if (!response.ok) return;
  const info = (await response.json()) as {
    epoch?: unknown;
    version?: unknown;
    builtAt?: unknown;
    protocol?: unknown;
    closing?: unknown;
  };
  if (info.epoch !== endpoint.epoch) return;
  if (info.protocol !== 1 || typeof info.version !== "string" || info.version !== endpoint.version)
    return;
  if (info.builtAt !== endpoint.builtAt) return;
  if (info.closing && purpose === "connect") return;
  if (
    purpose === "connect" &&
    (info.version !== manifest.version || info.builtAt !== cliBuild.builtAt)
  )
    throw new LocalError(
      "HOST_VERSION_MISMATCH",
      "Stop the previous daemon before using this CLI version",
    );
  return endpoint;
}
/**
 * Windows locks a running executable, so a long-lived owner must not run from the
 * Desktop bundle the updater replaces. Each build runs from its own private copy.
 */
function daemonLaunch(
  directory: string,
  launch = cliLaunch(),
  platform: NodeJS.Platform = process.platform,
  retain?: (release: () => void) => void,
) {
  const layout = cliInstallation();
  if (platform !== "win32" || !layout.bundled) return launch;
  const parent = join(dirname(dirname(directory)), "bin", "daemon");
  const target = join(parent, `${cliBuild.version}-${cliBuild.builtAt}`);
  const pin = runtimeLease(target);
  if (!pin) throw new LocalError("HOST_STOPPING", "Runtime cleanup is in progress; retry startup");
  let retained = false;
  try {
    installRuntimeCopy(layout.root, parent);
    for (const entry of readdirSync(parent)) {
      const candidate = join(parent, entry);
      if (candidate === target || !/^\d+\.\d+\.\d+-\d+$/.test(entry)) continue;
      let releaseOld: (() => void) | undefined;
      try {
        releaseOld = runtimeLease(candidate, true);
        if (releaseOld) rmSync(candidate, { recursive: true });
      } catch {
        /* A running owner or locked resource is retained in full. */
      } finally {
        releaseOld?.();
      }
    }
    if (retain) {
      retain(pin);
      retained = true;
    }
    return [join(target, "raypx.exe")];
  } finally {
    if (!retained) pin();
  }
}
export async function connectDaemon(options: ProfileOptions, start = true) {
  const directory = profilePath(options);
  const current = await probe(directory);
  if (current) return current;
  if (!start) throw new LocalError("HOST_NOT_RUNNING", "Raypx daemon is not running");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const release = acquireLock(directory, "daemon-launch");
  let releaseRuntime: (() => void) | undefined;
  try {
    if (release) {
      const deadline = Date.now() + 10_000;
      for (;;) {
        const ready = await probe(directory);
        if (ready) return ready;
        const available = acquireLock(directory, "daemon-owner");
        if (available) {
          available();
          break;
        }
        if (Date.now() >= deadline)
          throw new LocalError("HOST_STOPPING", "Wait for the execution owner to finish stopping");
        await sleep(50);
      }
      const child = spawnProcess(
        [
          ...daemonLaunch(directory, cliLaunch(), process.platform, (close) => {
            releaseRuntime = close;
          }),
          "daemon",
          "run",
          "--profile",
          options.profile ?? "default",
          ...(options.dataDir ? ["--data-dir", options.dataDir] : []),
        ],
        {
          detached: true,
          env: process.env,
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
          windowsHide: true,
        },
      );
      child.unref();
    }
    // Windows startup includes the PowerShell profile ACL check.
    const deadline = Date.now() + (process.platform === "win32" ? 45_000 : 10_000);
    while (Date.now() < deadline) {
      const ready = await probe(directory);
      if (ready) return ready;
      await sleep(50);
    }
    throw new LocalError(
      "HOST_START_FAILED",
      "Daemon could not acquire the profile; stop the previous execution owner and retry",
    );
  } finally {
    releaseRuntime?.();
    release?.();
  }
}

/** Version-independent administrative stop; wait for ownership, not just the HTTP ACK. */
export async function stopDaemon(options: ProfileOptions) {
  const endpoint = await probe(profilePath(options), "stop");
  if (!endpoint) throw new LocalError("HOST_NOT_RUNNING", "Raypx daemon is not running");
  const response = await daemonFetch(endpoint, "/stop", {}, AbortSignal.timeout(5000));
  if (!response.ok) throw new LocalError("HOST_UNAVAILABLE", "Daemon rejected stop");
  const deadline = Date.now() + 15_000;
  for (;;) {
    const available = acquireLock(profilePath(options), "daemon-owner");
    if (available) {
      available();
      return { stopped: true };
    }
    if (Date.now() >= deadline)
      throw new LocalError(
        "HOST_STOPPING",
        "The daemon is still stopping; retry status before starting work",
      );
    await sleep(50);
  }
}
