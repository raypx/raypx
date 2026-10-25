import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import manifest from "../../../package.json";
import { profilePath, acquireLock } from "../state";
import { LocalError } from "../errors";

export type ProfileOptions = { dataDir?: string; profile?: string };
export const daemonEndpointSchema = z.object({
  protocol: z.literal(1),
  version: z.string(),
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
async function probe(directory: string) {
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
    protocol?: unknown;
  };
  if (info.epoch !== endpoint.epoch) return;
  if (info.version !== manifest.version || info.protocol !== 1)
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
export async function connectDaemon(options: ProfileOptions, start = true) {
  if (process.platform === "win32")
    throw new LocalError("UNSUPPORTED_PLATFORM", "Daemon IPC requires a Unix socket");
  const directory = profilePath(options);
  const current = await probe(directory);
  if (current) return current;
  if (!start) throw new LocalError("HOST_NOT_RUNNING", "Raypx daemon is not running");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const release = acquireLock(directory, "daemon-launch");
  try {
    if (release) {
      const ready = await probe(directory);
      if (ready) return ready;
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
      const ready = await probe(directory);
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
