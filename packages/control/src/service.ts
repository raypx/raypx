import type { ControlRepository } from "./ports.ts";
import type { ResolveTaskContext } from "./records.ts";
export { ControlError, type RelayActor, type ResolveTaskContext } from "./records.ts";
export { ControlProjects } from "./application/projects.ts";
import { ControlCredentials } from "./application/credentials.ts";
import { ControlCommands } from "./application/commands.ts";
import { TaskProjection } from "./application/task-projection.ts";
import { ObservedProjectionStore } from "./application/observed-projection.ts";
import { ControlProjects } from "./application/projects.ts";

export class ControlService {
  readonly credentials: ControlCredentials;
  readonly projects: ControlProjects;
  readonly commands: ControlCommands;
  readonly tasks: TaskProjection;
  readonly observed: ObservedProjectionStore;
  constructor(
    repository: ControlRepository,
    clock: () => number = Date.now,
    resolveContext?: ResolveTaskContext,
    projects = new ControlProjects(repository),
  ) {
    this.credentials = new ControlCredentials(repository, clock);
    this.projects = projects;
    this.commands = new ControlCommands(repository, clock, this.credentials, resolveContext);
    this.tasks = new TaskProjection(repository, clock, this.credentials);
    this.observed = new ObservedProjectionStore(repository, clock, this.credentials);
  }
}
