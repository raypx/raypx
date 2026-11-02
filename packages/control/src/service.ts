import type { ControlRepository } from "./repository.js";
import type { ResolveTaskContext } from "./records.js";
export { ControlError, type RelayActor, type ResolveTaskContext } from "./records.js";
import { ControlCredentials } from "./credentials.js";
import { ControlCommands } from "./commands.js";
import { TaskProjection } from "./task-projection.js";
import { ObservedProjectionStore } from "./observed-projection.js";

/** Compose credential fencing, command routing and independently owned projections. */
export class ControlService {
  private readonly credentials: ControlCredentials;
  private readonly commands: ControlCommands;
  private readonly tasks: TaskProjection;
  private readonly observedProjection: ObservedProjectionStore;
  constructor(
    repository: ControlRepository,
    clock: () => number = Date.now,
    resolveContext?: ResolveTaskContext,
  ) {
    this.credentials = new ControlCredentials(repository, clock);
    this.commands = new ControlCommands(repository, clock, this.credentials, resolveContext);
    this.tasks = new TaskProjection(repository, clock, this.credentials);
    this.observedProjection = new ObservedProjectionStore(repository, clock, this.credentials);
  }
  ticket(
    ...args: Parameters<ControlCredentials["ticket"]>
  ): ReturnType<ControlCredentials["ticket"]> {
    return this.credentials.ticket(...args);
  }
  register(
    ...args: Parameters<ControlCredentials["register"]>
  ): ReturnType<ControlCredentials["register"]> {
    return this.credentials.register(...args);
  }
  refreshGrant(
    ...args: Parameters<ControlCredentials["refreshGrant"]>
  ): ReturnType<ControlCredentials["refreshGrant"]> {
    return this.credentials.refreshGrant(...args);
  }
  authorizeHost(
    ...args: Parameters<ControlCredentials["authorizeHost"]>
  ): ReturnType<ControlCredentials["authorizeHost"]> {
    return this.credentials.authorizeHost(...args);
  }
  hostGrant(
    ...args: Parameters<ControlCredentials["hostGrant"]>
  ): ReturnType<ControlCredentials["hostGrant"]> {
    return this.credentials.hostGrant(...args);
  }
  revokeHost(
    ...args: Parameters<ControlCredentials["revokeHost"]>
  ): ReturnType<ControlCredentials["revokeHost"]> {
    return this.credentials.revokeHost(...args);
  }
  revokeHostAuthorizations(
    ...args: Parameters<ControlCredentials["revokeHostAuthorizations"]>
  ): ReturnType<ControlCredentials["revokeHostAuthorizations"]> {
    return this.credentials.revokeHostAuthorizations(...args);
  }
  authenticate(
    ...args: Parameters<ControlCredentials["authenticate"]>
  ): ReturnType<ControlCredentials["authenticate"]> {
    return this.credentials.authenticate(...args);
  }
  validate(
    ...args: Parameters<ControlCredentials["validate"]>
  ): ReturnType<ControlCredentials["validate"]> {
    return this.credentials.validate(...args);
  }
  announce(
    ...args: Parameters<TaskProjection["announce"]>
  ): ReturnType<TaskProjection["announce"]> {
    return this.tasks.announce(...args);
  }
  connection(
    ...args: Parameters<TaskProjection["connection"]>
  ): ReturnType<TaskProjection["connection"]> {
    return this.tasks.connection(...args);
  }
  touch(...args: Parameters<TaskProjection["touch"]>): ReturnType<TaskProjection["touch"]> {
    return this.tasks.touch(...args);
  }
  disconnect(
    ...args: Parameters<TaskProjection["disconnect"]>
  ): ReturnType<TaskProjection["disconnect"]> {
    return this.tasks.disconnect(...args);
  }
  snapshot(
    ...args: Parameters<TaskProjection["snapshot"]>
  ): ReturnType<TaskProjection["snapshot"]> {
    return this.tasks.snapshot(...args);
  }
  events(...args: Parameters<TaskProjection["events"]>): ReturnType<TaskProjection["events"]> {
    return this.tasks.events(...args);
  }
  validateJobTarget(
    ...args: Parameters<ControlCommands["validateJobTarget"]>
  ): ReturnType<ControlCommands["validateJobTarget"]> {
    return this.commands.validateJobTarget(...args);
  }
  validateContextProject(
    ...args: Parameters<ControlCommands["validateContextProject"]>
  ): ReturnType<ControlCommands["validateContextProject"]> {
    return this.commands.validateContextProject(...args);
  }
  validateJobPeer(
    ...args: Parameters<ControlCommands["validateJobPeer"]>
  ): ReturnType<ControlCommands["validateJobPeer"]> {
    return this.commands.validateJobPeer(...args);
  }
  jobTask(...args: Parameters<ControlCommands["jobTask"]>): ReturnType<ControlCommands["jobTask"]> {
    return this.commands.jobTask(...args);
  }
  route(...args: Parameters<ControlCommands["route"]>): ReturnType<ControlCommands["route"]> {
    return this.commands.route(...args);
  }
  listDevices(
    ...args: Parameters<ControlCredentials["listDevices"]>
  ): ReturnType<ControlCredentials["listDevices"]> {
    return this.credentials.listDevices(...args);
  }
  revoke(
    ...args: Parameters<ControlCredentials["revoke"]>
  ): ReturnType<ControlCredentials["revoke"]> {
    return this.credentials.revoke(...args);
  }
  listTasks(
    ...args: Parameters<TaskProjection["listTasks"]>
  ): ReturnType<TaskProjection["listTasks"]> {
    return this.tasks.listTasks(...args);
  }
  getTask(...args: Parameters<TaskProjection["getTask"]>): ReturnType<TaskProjection["getTask"]> {
    return this.tasks.getTask(...args);
  }
  listApprovals(
    ...args: Parameters<TaskProjection["listApprovals"]>
  ): ReturnType<TaskProjection["listApprovals"]> {
    return this.tasks.listApprovals(...args);
  }
  observed(
    ...args: Parameters<ObservedProjectionStore["observed"]>
  ): ReturnType<ObservedProjectionStore["observed"]> {
    return this.observedProjection.observed(...args);
  }
  listObserved(
    ...args: Parameters<ObservedProjectionStore["listObserved"]>
  ): ReturnType<ObservedProjectionStore["listObserved"]> {
    return this.observedProjection.listObserved(...args);
  }
  getObserved(
    ...args: Parameters<ObservedProjectionStore["getObserved"]>
  ): ReturnType<ObservedProjectionStore["getObserved"]> {
    return this.observedProjection.getObserved(...args);
  }
  replay(...args: Parameters<TaskProjection["replay"]>): ReturnType<TaskProjection["replay"]> {
    return this.tasks.replay(...args);
  }
}
