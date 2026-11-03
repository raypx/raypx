import type { ControlRepository } from "./ports.js";
import type { ResolveTaskContext } from "./records.js";
export { ControlError, type RelayActor, type ResolveTaskContext } from "./records.js";
export { ControlProjects } from "./application/projects.js";
import { ControlCredentials } from "./application/credentials.js";
import { ControlCommands } from "./application/commands.js";
import { TaskProjection } from "./application/task-projection.js";
import { ObservedProjectionStore } from "./application/observed-projection.js";
import { ControlProjects } from "./application/projects.js";

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
