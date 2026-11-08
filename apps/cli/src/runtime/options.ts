import type { AgentProvider } from "@raypx/core/tasks";
import type { LocalEvent } from "@raypx/contracts/local";
import type { RecordDiagnostic } from "../diagnostics.ts";
import type { InstanceAccess } from "./instances/index.ts";

export type ExecutionMode = "command" | "tui" | "stdio" | "daemon";
export interface RuntimeOptions {
  mode?: ExecutionMode;
  instanceAccess?: InstanceAccess;
  onInstanceRevoked?: () => Promise<void>;
  dataDir?: string;
  profile?: string;
  emit?: (event: LocalEvent) => void;
  agentExecutables?: Partial<Record<AgentProvider, string>>;
  recordDiagnostic?: RecordDiagnostic;
}
