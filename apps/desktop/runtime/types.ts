import type { AgentRunDto, DeviceBindingDto, RunCommandDto, RunEventDto } from "@voidmix/contracts";
import type { AiProvider } from "@voidmix/ai";

export interface RunnerBinding {
  localBindingId: string;
  projectId: string;
  path: string;
  tools: string[];
  model: { provider: string; id: string };
}
export interface Claim {
  run: AgentRunDto;
  binding: DeviceBindingDto;
  claimId: string;
}
export interface RunnerCloud {
  heartbeat(): Promise<unknown>;
  claim(): Promise<Claim | null>;
  acknowledge(input: { runId: string; claimId: string }): Promise<unknown>;
  append(input: {
    runId: string;
    claimId: string;
    events: RunEventDto[];
  }): Promise<{ acknowledgedSeq: number }>;
  commands(input: { runId: string; claimId: string }): Promise<{ items: RunCommandDto[] }>;
  acknowledgeCommand(input: {
    runId: string;
    claimId: string;
    commandId: string;
    outcome: "applied" | "rejected";
    error?: string;
  }): Promise<unknown>;
  uploadArtifact?(input: {
    runId: string;
    claimId: string;
    name: string;
    bodyBase64: string;
    contentType: string;
    checksum: string;
    idempotencyKey: string;
  }): Promise<{ assetVersionId: string }>;
}
type EventFields<E extends RunEventDto> = E extends RunEventDto
  ? { type: E["type"]; payload: E["payload"] }
  : never;
export type EventInput = EventFields<RunEventDto>;
export interface LocalRun {
  claim: Claim;
  acknowledged: boolean;
  status: AgentRunDto["status"];
  error: string | null;
  sessionFile: string | null;
  syncedSeq: number;
  pendingApproval: { approvalId: string; prompt: string } | null;
}
export interface RunnerRun {
  id: string;
  projectId: string;
  status: LocalRun["status"];
  error: string | null;
  pendingApproval: LocalRun["pendingApproval"];
  events: RunEventDto[];
  files: RunnerFileRef[];
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
export interface StoredArtifact extends RunnerFileRef {
  bodyBase64: string;
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
export interface ProviderFactoryInput {
  binding: RunnerBinding;
  guardTool: NonNullable<Parameters<typeof import("@voidmix/ai").createPiProvider>[0]>["guardTool"];
}
export type ProviderFactory = (input: ProviderFactoryInput) => AiProvider;
