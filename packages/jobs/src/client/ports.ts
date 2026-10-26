import type { CloudJob, CloudJobCreateInput, CloudJobInput, CloudJobRun } from "../model.js";
import type { AgentProvider } from "@raypx/core/tasks";

export interface JobReadOptions {
  signal?: AbortSignal | undefined;
}
export interface CloudJobsPort {
  list(input?: {}, options?: JobReadOptions): Promise<{ enabled: boolean; jobs: CloudJob[] }>;
  create(input: CloudJobCreateInput, options?: JobReadOptions): Promise<CloudJob>;
  update(
    input: { id: string; revision: number; job: CloudJobInput },
    options?: JobReadOptions,
  ): Promise<CloudJob>;
  remove(
    input: { id: string; revision: number },
    options?: JobReadOptions,
  ): Promise<{ deleted: true }>;
  run(input: { id: string; requestId: string }, options?: JobReadOptions): Promise<CloudJobRun>;
  history(
    input: { id: string; limit?: number | undefined },
    options?: JobReadOptions,
  ): Promise<CloudJobRun[]>;
}
export interface JobDevice {
  id: string;
  epoch: number;
  name: string;
  online: boolean;
  projects: { id: string; name: string }[];
  capabilities: { provider: AgentProvider; available: boolean }[];
}
export interface JobDevicesPort {
  list(input?: {}, options?: JobReadOptions): Promise<JobDevice[]>;
}
