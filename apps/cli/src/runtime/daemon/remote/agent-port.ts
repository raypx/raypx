import type { AgentCapability } from "@raypx/core/tasks";
import type {
  DeviceProject,
  RelayCommand,
  SequencedEvent,
  SnapshotRecord,
} from "@raypx/contracts/tasks";
export interface HostAgentPort {
  observed(
    input: {
      binding: string;
      decision: import("@raypx/contracts/terminal").TerminalDecision;
    },
    signal?: AbortSignal,
  ): Promise<unknown>;
  projects(input: {}, signal?: AbortSignal): Promise<DeviceProject[]>;
  capabilities(input: {}, signal?: AbortSignal): Promise<AgentCapability[]>;
  events(input: { binding: string }, signal?: AbortSignal): Promise<{ instanceId: string }>;
  replay(
    input: {
      binding: string;
      after: number;
    },
    signal?: AbortSignal,
  ): Promise<{ streamId: string; sequence: number; floor: number; events: SequencedEvent[] }>;
  snapshot(
    input: { binding: string; id?: string; offset: number },
    signal?: AbortSignal,
  ): Promise<{
    id: string;
    streamId: string;
    sequence: number;
    records: SnapshotRecord[];
    next: number;
    done: boolean;
  }>;
  remote(
    input: {
      binding: string;
      command: RelayCommand;
    },
    signal?: AbortSignal,
  ): Promise<{ ok: true; value: unknown } | { ok: false; code: string }>;
  checkpoint(input: { binding: string; sequence: number }, signal?: AbortSignal): Promise<unknown>;
  /** Explicit binding cleanup outlives its network connection. */
  detach(input: { binding: string }): Promise<unknown>;
}
