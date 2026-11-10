import { ContextLibraryService } from "@raypx/memory/server";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";

import { type TaskContextSelection, type TaskContextTarget } from "@raypx/core/tasks";
import type { LocalDatabase } from "../sqlite/index.ts";
import { SqliteContextRepository } from "./repository.ts";

/** One device-profile workspace, independent of remote accounts and deployments. */
export class MemoryRuntime {
  private readonly repository: SqliteContextRepository;
  readonly service: ContextLibraryService;
  constructor(
    database: LocalDatabase,
    validateProject: (target: TaskContextTarget) => void | Promise<void>,
  ) {
    this.repository = new SqliteContextRepository(database);
    this.service = new ContextLibraryService({
      repository: this.repository,
      scope: "device",
      validateProject: (_owner, target) => Promise.resolve(validateProject(target)),
    });
  }
  async resolve(selection: TaskContextSelection, target: TaskContextTarget, prompt = " ") {
    return this.service.resolve(LOCAL_WORKSPACE_ID, selection, target, prompt);
  }
}
