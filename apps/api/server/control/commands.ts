import type { CloudJobAction } from "@raypx/jobs";
import { ContextError } from "@raypx/memory";
import {
  taskExecutionPrompt,
  TaskContextError,
  type TaskContextSelection,
  type TaskContextSnapshot,
  type TaskContextTarget,
} from "@raypx/core/tasks";

import { type AgentTask, type RelayRequest } from "@raypx/contracts/tasks";
import type { ControlRepository, ControlReader } from "./repository.js";
import { CONTEXT_COMMAND_TTL_MS } from "./repository.js";

import {
  ControlError,
  type Device,
  type ObservedRequest,
  type Task,
  type ContextCommand,
  type RoutedCommand,
  type ResolveTaskContext,
  type Project,
  type StoredRequest,
  type RelayActor,
  required,
  hash,
  canonical,
} from "./records.js";
import type { ControlCredentials } from "./credentials.js";
export class ControlCommands {
  constructor(
    private readonly repository: ControlRepository,
    private readonly clock: () => number,
    private readonly credentials: ControlCredentials,
    private readonly resolveContext?: ResolveTaskContext,
  ) {}
  private now() {
    return new Date(this.clock()).toISOString();
  }
  private async jobTarget(tx: ControlReader, action: CloudJobAction) {
    const device = required(await tx.get<Device>("device", action.deviceId));
    if (device.revoked || device.epoch !== action.epoch) throw new ControlError("DEVICE_REVOKED");
    if (action.type === "agent.run") {
      const project = required(
        await tx.get<Project>("project", `${device.id}:${action.projectId}`),
      );
      if (!project.providers.includes(action.provider))
        throw new ControlError("PROVIDER_UNAVAILABLE");
      if (
        !device.capabilities.some(
          (capability) => capability.provider === action.provider && capability.available,
        )
      )
        throw new ControlError("PROVIDER_UNAVAILABLE");
    }
    return device;
  }
  async validateJobTarget(userId: string, action: CloudJobAction) {
    await this.repository.read(userId, async (tx) => {
      await this.jobTarget(tx, action);
    });
    if (action.type === "agent.run" && action.contextSelection?.sources.length)
      await this.contextFor(userId, action.contextSelection, action, action.prompt);
  }
  validateContextProject(userId: string, target: TaskContextTarget) {
    return this.repository.read(userId, async (tx) => {
      const device = required(await tx.get<Device>("device", target.deviceId));
      if (device.revoked) throw new ControlError("DEVICE_REVOKED");
      required(await tx.get<Project>("project", `${device.id}:${target.projectId}`));
    });
  }
  private async contextFor(
    userId: string,
    selection: TaskContextSelection,
    target: TaskContextTarget,
    prompt: string,
  ) {
    if (!this.resolveContext) throw new ControlError("CONTEXT_UNAVAILABLE");
    try {
      return await this.resolveContext(
        userId,
        selection,
        {
          deviceId: target.deviceId,
          projectId: target.projectId,
        },
        prompt,
      );
    } catch (error) {
      if (error instanceof ContextError || error instanceof TaskContextError)
        throw new ControlError(error.code);
      throw error;
    }
  }
  validateJobPeer(actor: RelayActor, action: CloudJobAction) {
    return this.repository.read(actor.userId, async (tx) => {
      if (
        actor.role !== "device" ||
        actor.deviceId !== action.deviceId ||
        actor.epoch !== action.epoch
      )
        throw new ControlError("DEVICE_REPLACED");
      await this.credentials.check(tx, actor);
      const device = await this.jobTarget(tx, action);
      if (device.connectionId !== actor.connectionId) throw new ControlError("DEVICE_REPLACED");
    });
  }
  jobTask(userId: string, taskId: string) {
    return this.repository.read(userId, async (tx) => {
      const task = await tx.get<Task>("task", taskId);
      return task ? { status: task.status } : null;
    });
  }
  private recoveredTask(
    task: AgentTask,
    id: string,
    request: Extract<RelayRequest, { method: "tasks.create" }>,
  ): RoutedCommand {
    const input = request.input;
    const expected = input.contextSelection?.sources ?? [];
    const actual = task.context?.sources ?? [];
    if (
      id !== input.id ||
      task.parentTaskId !== null ||
      (["id", "deviceId", "projectId", "provider", "mode", "prompt"] as const).some(
        (key) => canonical(task[key]) !== canonical(input[key]),
      ) ||
      !expected.length ||
      expected.length !== actual.length ||
      expected.some(
        (source, index) =>
          source.id.toLowerCase() !== actual[index]?.id.toLowerCase() ||
          source.revision !== actual[index]?.revision,
      )
    )
      throw new ControlError("IDEMPOTENCY_CONFLICT");
    return {
      id,
      deviceId: task.deviceId,
      request,
      expiresAt: this.now(),
      context: task.context!,
      recoveredTask: task,
    };
  }
  private commandContext(
    previous: ContextCommand,
    request: RelayRequest,
    requestHash: string,
  ): TaskContextSnapshot {
    if (previous.requestHash && previous.requestHash !== requestHash)
      throw new ControlError("IDEMPOTENCY_CONFLICT");
    if (previous.compacted || !previous.context) throw new ControlError("CONTEXT_REQUEST_EXPIRED");
    if (canonical(previous.request) !== canonical(request))
      throw new ControlError("IDEMPOTENCY_CONFLICT");
    const acceptedAt = Date.parse(previous.capturedAt ?? previous.context.capturedAt);
    if (!Number.isFinite(acceptedAt) || this.clock() - acceptedAt >= CONTEXT_COMMAND_TTL_MS)
      throw new ControlError("CONTEXT_REQUEST_EXPIRED");
    if (request.method === "tasks.create") {
      try {
        taskExecutionPrompt({ prompt: request.input.prompt, context: previous.context });
      } catch {
        throw new ControlError("CONTEXT_TOO_LARGE");
      }
    }
    return previous.context;
  }
  async route(
    userId: string,
    id: string,
    request: RelayRequest,
    job?: CloudJobAction,
  ): Promise<RoutedCommand> {
    let context: TaskContextSnapshot | undefined;
    const requestHash =
      request.method === "tasks.create" && request.input.contextSelection?.sources.length
        ? await hash(canonical(request) ?? "")
        : "";
    if (request.method === "tasks.create" && request.input.contextSelection?.sources.length) {
      if (id !== request.input.id) throw new ControlError("IDEMPOTENCY_CONFLICT");
      const [previous, task] = await this.repository.read(userId, (tx) =>
        Promise.all([tx.get<ContextCommand>("command", id), tx.get<Task>("task", id)]),
      );
      if (task) return this.recoveredTask(task, id, request);
      if (previous) {
        context = this.commandContext(previous, request, requestHash);
      } else
        context = await this.contextFor(
          userId,
          request.input.contextSelection,
          request.input,
          request.input.prompt,
        );
    }
    return this.repository.transaction(userId, async (tx) => {
      if (context && request.method === "tasks.create") {
        const task = await tx.get<Task>("task", id);
        if (task) return this.recoveredTask(task, id, request);
      }
      if (job) {
        await this.jobTarget(tx, job);
        if (
          job.type !== "agent.run" ||
          request.method !== "tasks.create" ||
          request.input.deviceId !== job.deviceId ||
          request.input.projectId !== job.projectId ||
          request.input.provider !== job.provider ||
          request.input.mode !== job.mode ||
          request.input.prompt !== job.prompt ||
          canonical(request.input.contextSelection) !== canonical(job.contextSelection)
        )
          throw new ControlError("IDEMPOTENCY_CONFLICT");
      }
      let deviceId: string;
      if (request.method === "observed.decide") {
        const pending = required(
          await tx.get<ObservedRequest>("observed_request", request.input.id),
        );
        if (
          pending.status !== "pending" ||
          Date.parse(pending.expiresAt) <= this.clock() ||
          pending.epoch !== request.input.epoch ||
          pending.revision !== request.input.revision
        )
          throw new ControlError("STALE_REQUEST");
        if (id !== request.input.receiptId) throw new ControlError("IDEMPOTENCY_CONFLICT");
        deviceId = pending.deviceId;
      } else if (request.method === "tasks.create") deviceId = request.input.deviceId;
      else if (request.method === "approvals.decide")
        deviceId = required(await tx.get<StoredRequest>("request", request.input.id)).deviceId;
      else
        deviceId = required(
          await tx.get<Task>(
            "task",
            request.method === "tasks.cancel"
              ? request.input.id
              : request.method === "tasks.input"
                ? request.input.taskId
                : request.input.parentTaskId,
          ),
        ).deviceId;
      const device = required(await tx.get<Device>("device", deviceId));
      if (device.revoked) throw new ControlError("DEVICE_REVOKED");
      if (
        (request.method === "tasks.create" ||
          request.method === "tasks.followUp" ||
          request.method === "tasks.input") &&
        id !== request.input.id
      )
        throw new ControlError("IDEMPOTENCY_CONFLICT");
      const previous = await tx.get<ContextCommand>("command", id);
      if (previous) {
        if (previous.deviceId !== deviceId) throw new ControlError("IDEMPOTENCY_CONFLICT");
        context = this.commandContext(previous, request, requestHash);
      } else if (context) {
        await tx.put("command", {
          id,
          deviceId,
          request,
          context,
          requestHash,
          capturedAt: this.now(),
        });
        await tx.pruneCommands(new Date(this.clock()));
      }
      return {
        id,
        deviceId,
        expiresAt: new Date(this.clock() + 15_000).toISOString(),
        request,
        ...(context ? { context } : {}),
      };
    });
  }
}
