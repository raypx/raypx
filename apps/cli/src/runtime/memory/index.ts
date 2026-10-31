import { join } from "node:path";
import { ContextLibraryService } from "@raypx/memory/server";
import { ContextError } from "@raypx/memory";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";

import { type TaskContextSelection, type TaskContextTarget } from "@raypx/core/tasks";
import type { AgentRuntime } from "../agents";
import { SqliteContextRepository } from "./repository";

/** One device-profile workspace, independent of remote accounts and deployments. */
export class MemoryRuntime {
  private readonly repository: SqliteContextRepository;
  readonly service: ContextLibraryService;
  constructor(directory: string, agents: () => AgentRuntime) {
    this.repository = new SqliteContextRepository(join(directory, "memory.sqlite"));
    this.service = new ContextLibraryService({
      repository: this.repository,
      scope: "device",
      validateProject: async (_owner, target) => {
        const host = agents();
        const device = await host.localDevice(LOCAL_WORKSPACE_ID);
        if (
          target.deviceId !== device.id ||
          !device.projects.some((project) => project.id === target.projectId)
        )
          throw new ContextError("CONTEXT_PROJECT_MISMATCH");
      },
    });
  }
  async resolve(selection: TaskContextSelection, target: TaskContextTarget, prompt = " ") {
    return this.service.resolve(LOCAL_WORKSPACE_ID, selection, target, prompt);
  }
  close() {
    this.repository.close();
  }
}
