import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import manifest from "../../../package.json";
import { cliBuild } from "./build";
import { profilePath, acquireLock } from "../state";
import { LocalError } from "../errors";

export type ProfileOptions = { dataDir?: string; profile?: string };
export const daemonEndpointSchema = z.object({
  protocol: z.literal(1),
  version: z.string(),
  builtAt: z.number().nonnegative().optional(),
  epoch: z.string().uuid(),
  socket: z.string().min(1).max(104),
  token: z.string().min(64).max(200),
});
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
  return fetch(`http://localhost${path}`, {
    unix: endpoint.socket,
    redirect: "error",
    headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
}
async function probe(directory: string, compatibility: "match" | "any" = "match") {
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
  if (info.closing && compatibility === "match") return;
  if (
    compatibility === "match" &&
    (info.version !== manifest.version || (info.builtAt ?? 0) !== cliBuild.builtAt)
  )
    throw new LocalError(
      "HOST_VERSION_MISMATCH",
      "Stop the previous daemon before using this CLI version",
    );
  return endpoint;
}
export function cliLaunch() {
  return /(?:^|[/\\])bun(?:\.exe)?$/.test(process.execPath)
    ? [process.execPath, Bun.main]
    : [process.execPath];
}
export async function connectDaemon(
  options: ProfileOptions,
  start = true,
  compatibility: "match" | "any" = "match",
) {
  if (process.platform === "win32")
    throw new LocalError("UNSUPPORTED_PLATFORM", "Daemon IPC requires a Unix socket");
  const directory = profilePath(options);
  const current = await probe(directory, compatibility);
  if (current) return current;
  if (!start) throw new LocalError("HOST_NOT_RUNNING", "Raypx daemon is not running");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const release = acquireLock(directory, "daemon-launch");
  try {
    if (release) {
      const deadline = Date.now() + 10_000;
      for (;;) {
        const ready = await probe(directory, compatibility);
        if (ready) return ready;
        const available = acquireLock(directory, "daemon-owner");
        if (available) {
          available();
          break;
        }
        if (Date.now() >= deadline)
          throw new LocalError("HOST_STOPPING", "Wait for the execution owner to finish stopping");
        await Bun.sleep(50);
      }
      const child = Bun.spawn(
        [
          ...cliLaunch(),
          "daemon",
          "run",
          "--profile",
          options.profile ?? "default",
          ...(options.dataDir ? ["--data-dir", options.dataDir] : []),
        ],
        {
          detached: true,
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
        },
      );
      child.unref();
    }
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const ready = await probe(directory, compatibility);
      if (ready) return ready;
      await Bun.sleep(50);
    }
    throw new LocalError(
      "HOST_START_FAILED",
      "Daemon could not acquire the profile; stop the previous execution owner and retry",
    );
  } finally {
    release?.();
  }
}

/** Version-independent administrative stop; wait for ownership, not just the HTTP ACK. */
export async function stopDaemon(options: ProfileOptions) {
  const endpoint = await connectDaemon(options, false, "any");
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
    await Bun.sleep(50);
  }
}
