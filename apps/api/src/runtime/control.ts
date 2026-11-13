import { ControlProjects, ControlService } from "@raypx/control";
import { createControlRepository } from "@raypx/control/postgres";
import type { Database } from "@raypx/database/connection";
import { ContextLibraryService, type ContextLibraryRepository } from "@raypx/memory/server";
import { createContextRepository } from "@raypx/memory/server/postgres";
import { withSessionAttachments } from "../storage/attachments.js";

/**
 * The one Control composition for every backend role. A role that routes Relay
 * commands and a role that serves RPC must resolve task context identically.
 */
export function composeControl(
  db: Database,
  createRepository: (db: Database) => ContextLibraryRepository = createContextRepository,
) {
  const repository = createControlRepository(db);
  const projects = new ControlProjects(repository);
  const memory = new ContextLibraryService({
    repository: createRepository(db),
    scope: "account",
    validateProject: (owner, target) => projects.validateContextProject(owner, target),
  });
  const resolveContext = withSessionAttachments(db, (owner, selection, target, prompt) =>
    memory.resolve(owner, selection, target, prompt),
  );
  const control = new ControlService(repository, Date.now, resolveContext, projects);
  return { control, projects, memory, resolveContext };
}
