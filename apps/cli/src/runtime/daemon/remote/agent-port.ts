import type { AgentCapability } from "@raypx/core/tasks";
import type {
  DeviceProject,
  RelayCommand,
  SequencedEvent,
  SnapshotRecord,
} from "@raypx/contracts/tasks";
export interface HostAgentPort {
  observed(input: {
    binding: string;
    decision: import("@raypx/contracts/terminal").TerminalDecision;
  }): Promise<unknown>;
  projects(input: {}): Promise<DeviceProject[]>;
  capabilities(input: {}): Promise<AgentCapability[]>;
  events(input: { binding: string }): Promise<{ instanceId: string }>;
  replay(input: {
    binding: string;
    after: number;
  }): Promise<{ streamId: string; sequence: number; floor: number; events: SequencedEvent[] }>;
  snapshot(input: { binding: string; id?: string; offset: number }): Promise<{
    id: string;
    streamId: string;
    sequence: number;
    records: SnapshotRecord[];
    next: number;
    done: boolean;
  }>;
  remote(input: {
    binding: string;
    command: RelayCommand;
  }): Promise<{ ok: true; value: unknown } | { ok: false; code: string }>;
  checkpoint(input: { binding: string; sequence: number }): Promise<unknown>;
  detach(input: { binding: string }): Promise<unknown>;
}
