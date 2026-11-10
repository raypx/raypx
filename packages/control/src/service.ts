import type { ControlRepository } from "./ports.ts";
import type { RelayActor, ResolveTaskContext } from "./records.ts";
export { ControlError, type RelayActor, type ResolveTaskContext } from "./records.ts";
export { ControlProjects } from "./application/projects.ts";
import { ControlCredentials } from "./application/credentials.ts";
import { ControlCommands } from "./application/commands.ts";
import { TaskProjection } from "@raypx/tasks/server";
import { taskProjectionPorts } from "./task-ports.ts";
import { ObservedProjectionStore } from "./application/observed-projection.ts";
import { ControlProjects } from "./application/projects.ts";

export class ControlService {
  readonly credentials: ControlCredentials;
  readonly projects: ControlProjects;
  readonly commands: ControlCommands;
  readonly tasks: TaskProjection<RelayActor>;
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
    this.tasks = new TaskProjection(taskProjectionPorts(repository, this.credentials), clock);
    this.observed = new ObservedProjectionStore(repository, clock, this.credentials);
  }
}
