import { Channel, invoke } from "@tauri-apps/api/core";
import type { RunEventDto } from "@voidmix/contracts";

export interface RunnerBinding {
  localBindingId: string;
  projectId: string;
  path: string;
  tools: string[];
  model: { provider: string; id: string };
}
export interface RunnerFileRef {
  id: string;
  runId: string;
  path: string;
  name: string;
  size: number;
  checksum: string;
  syncStatus: "pending" | "synced";
  assetVersionId: string | null;
}
export interface RunnerRun {
  id: string;
  projectId: string;
  status: "queued" | "running" | "waiting_for_approval" | "succeeded" | "failed" | "cancelled";
  error: string | null;
  pendingApproval: { approvalId: string; prompt: string } | null;
  events: RunEventDto[];
  files: RunnerFileRef[];
}
export interface RunnerStatus {
  registrationId: string;
  availability: "ready" | "unavailable";
  reason: string | null;
  deviceId: string | null;
  bindings: RunnerBinding[];
  runs: RunnerRun[];
}
export interface RunnerNotice {
  type: "status";
  status: RunnerStatus;
}
const native = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const unavailable = (): RunnerStatus => ({
  registrationId: "",
  availability: "unavailable",
  reason: "Local execution requires the installed Desktop application.",
  deviceId: null,
  bindings: [],
  runs: [],
});
async function command<T>(name: string, input?: unknown): Promise<T> {
  if (!native()) throw { code: "LOCAL_RUNNER_UNAVAILABLE" };
  return invoke<T>(name, input === undefined ? {} : { input });
}
export const runnerPlatform = {
  async getStatus(): Promise<RunnerStatus> {
    if (!native()) return unavailable();
    try {
      return await command("runner_status");
    } catch {
      return { ...unavailable(), reason: "The bundled local runner is unavailable." };
    }
  },
  configure: (input: { apiUrl: string; deviceId: string; credential: string }) =>
    command<void>("runner_configure", input),
  grant: (input: Omit<RunnerBinding, "localBindingId">) =>
    command<RunnerBinding>("runner_grant", input),
  revoke: (input: { localBindingId: string }) => command<void>("runner_revoke", input),
  cancel: (input: { runId: string }) => command<void>("runner_cancel", input),
  steer: (input: { runId: string; prompt: string }) => command<void>("runner_steer", input),
  approve: (input: { runId: string; approvalId: string; decision: "approve" | "deny" }) =>
    command<void>("runner_approve", input),
  async subscribe(listener: (event: RunnerNotice) => void): Promise<() => void> {
    if (!native()) {
      listener({ type: "status", status: unavailable() });
      return () => {};
    }
    const onEvent = new Channel<RunnerNotice>();
    onEvent.onmessage = listener;
    await invoke("runner_subscribe", { onEvent });
    return () => {
      onEvent.onmessage = () => {};
    };
  },
};
