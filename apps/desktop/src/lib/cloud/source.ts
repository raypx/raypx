import { env } from "../../env.js";
import { fetchRemoteSnapshot, type RemoteSnapshotResult } from "./remote";
import type { CloudSnapshot } from "./types";

export type CloudLoadResult =
  | { source: "cloud"; snapshot: CloudSnapshot }
  | { source: "unconfigured" | "offline" | "unavailable" };

export type RemoteSnapshotLoader = (
  apiUrl: string,
  signal?: AbortSignal,
) => Promise<RemoteSnapshotResult>;

export async function selectCloudSnapshot({
  apiUrl = env.VITE_API_URL,
  loadRemote = fetchRemoteSnapshot,
  signal,
}: {
  apiUrl?: string;
  loadRemote?: RemoteSnapshotLoader;
  signal?: AbortSignal;
} = {}): Promise<CloudLoadResult> {
  if (!apiUrl) return { source: "unconfigured" };
  const result = await loadRemote(apiUrl, signal);
  if (result.kind === "loaded") return { source: "cloud", snapshot: result.snapshot };
  return { source: result.kind === "health_check_failed" ? "offline" : "unavailable" };
}
