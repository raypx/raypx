import {
  ExecutionDomainError,
  publicDevice,
  publicRun,
  terminalRunStatuses,
  assertRunTransition,
  type ExecutionRepository,
  type ExecutionTransaction,
  type ExecutionDevice,
  type DeviceProjectBinding,
  type TaskRun,
  type RunEvent,
  type RunCommand,
  type RunArtifact,
  type PublicTaskRun,
  type PublicExecutionDevice,
  type ProjectTaskV2Repository,
  type AssetVersionV2Repository,
} from "@voidmix/core";
import type { ProjectAccess, AssetApplication } from "./types.js";
import { executionContext } from "./execution.js";

export interface ExecutionOptions {
  repository: ExecutionRepository;
  access: ProjectAccess;
  tasks: ProjectTaskV2Repository;
  assetVersions: AssetVersionV2Repository;
  assets?: AssetApplication;
  now?: () => Date;
  id?: () => string;
  issueCredential(ownerId: string, intentKey: string): Promise<string>;
  hashCredential(credential: string): Promise<string>;
}
export interface RunIntent {
  actorId: string;
  projectId: string;
  taskId: string;
  targetDeviceId: string;
  prompt: string;
  idempotencyKey: string;
  input?: Record<string, unknown>;
}
export interface DeviceRunInput {
  deviceId: string;
  runId: string;
  claimId: string;
}
const fail = (
  code: ConstructorParameters<typeof ExecutionDomainError>[0],
  message: string,
): never => {
  throw new ExecutionDomainError(code, message);
};
const same = (left: unknown, right: unknown): boolean => canonical(left) === canonical(right);
function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function createExecutionApplication(options: ExecutionOptions) {
  const { repository, access } = options;
  const { now, id } = executionContext(options);
  const requireDevice = async (
    tx: ExecutionTransaction,
    deviceId: string,
  ): Promise<ExecutionDevice> => {
    const device = await tx.getDevice(deviceId);
    if (!device || device.revokedAt)
      return fail("DEVICE_UNAUTHORIZED", "Device is missing or revoked.");
    return device;
  };
  const ownedDevice = async (tx: ExecutionTransaction, actorId: string, deviceId: string) => {
    const device = await requireDevice(tx, deviceId);
    if (device.ownerUserId !== actorId)
      fail("EXECUTION_ACCESS_DENIED", "Device owner is required.");
    return device;
  };
  const requireRun = async (tx: ExecutionTransaction, runId: string): Promise<TaskRun> => {
    const run = await tx.getRun(runId);
    return run ?? fail("RUN_NOT_FOUND", "Run was not found.");
  };
  const readableRun = async (tx: ExecutionTransaction, actorId: string, runId: string) => {
    const run = await requireRun(tx, runId);
    await access.assertCapability({
      actorId,
      projectId: run.projectId,
      capability: "project.read",
    });
    return run;
  };
  const controlledRun = async (tx: ExecutionTransaction, actorId: string, runId: string) => {
    const run = await requireRun(tx, runId);
    await access.assertCapability({
      actorId,
      projectId: run.projectId,
      capability: "project.write",
    });
    if (run.requestedByUserId !== actorId)
      fail("EXECUTION_ACCESS_DENIED", "Run owner is required.");
    await ownedDevice(tx, actorId, run.targetDeviceId);
    return run;
  };
  const deviceRun = async (tx: ExecutionTransaction, input: DeviceRunInput, accepted = true) => {
    await requireDevice(tx, input.deviceId);
    const run = await requireRun(tx, input.runId);
    if (
      run.targetDeviceId !== input.deviceId ||
      run.claimId !== input.claimId ||
      (accepted && !run.acceptedAt)
    )
      fail("RUN_CLAIM_INVALID", "Run is not owned by this device claim.");
    return run;
  };
  const verifyIntent = async (tx: ExecutionTransaction, input: RunIntent) => {
    await access.assertCapability({
      actorId: input.actorId,
      projectId: input.projectId,
      capability: "project.write",
    });
    const task = await options.tasks.getById(input.taskId);
    if (!task || task.projectId !== input.projectId)
      fail("EXECUTION_ACCESS_DENIED", "Task access denied.");
    await ownedDevice(tx, input.actorId, input.targetDeviceId);
    const binding = await tx.getBinding(input.targetDeviceId, input.projectId);
    if (!binding?.enabled)
      fail("DEVICE_NOT_BOUND", "Project is not enabled on the selected device.");
  };
  const createRun = async (
    tx: ExecutionTransaction,
    input: RunIntent,
    original?: TaskRun,
  ): Promise<PublicTaskRun> => {
    await verifyIntent(tx, input);
    const previous = await tx.findRunIntent(input.actorId, input.idempotencyKey);
    if (previous) {
      if (
        previous.taskId !== input.taskId ||
        previous.targetDeviceId !== input.targetDeviceId ||
        previous.prompt !== input.prompt ||
        !same(previous.input, input.input ?? {}) ||
        previous.retryOfRunId !== (original?.id ?? null)
      )
        fail("IDEMPOTENCY_CONFLICT", "This run intent has different input.");
      return publicRun(previous);
    }
    if (
      (await tx.listRuns(input.projectId, input.taskId)).some(
        (run) => !terminalRunStatuses.has(run.status),
      )
    )
      fail("RUN_ACTIVE", "The task already has an active run.");
    const timestamp = now();
    const run: TaskRun = {
      id: id(),
      projectId: input.projectId,
      taskId: input.taskId,
      targetDeviceId: input.targetDeviceId,
      requestedByUserId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      dispatchReady: false,
      assetVersionId: null,
      status: "queued",
      attempt: original ? original.attempt + 1 : 1,
      retryOfRunId: original?.id ?? null,
      prompt: input.prompt,
      input: input.input ?? {},
      output: null,
      error: null,
      lastSeq: 0,
      claimId: null,
      acceptedAt: null,
      completedAt: null,
      pendingApprovalId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await tx.queueRun(run);
    return publicRun(run);
  };
  const createCommand = async (
    tx: ExecutionTransaction,
    input: {
      actorId: string;
      runId: string;
      idempotencyKey: string;
      type: RunCommand["type"];
      payload: Record<string, unknown>;
    },
  ) => {
    const run = await controlledRun(tx, input.actorId, input.runId);
    const commands = await tx.listCommands(run.id);
    const previous = commands.find(
      (command) =>
        command.requestedByUserId === input.actorId &&
        command.idempotencyKey === input.idempotencyKey,
    );
    if (previous) {
      if (previous.type !== input.type || !same(previous.payload, input.payload))
        fail("IDEMPOTENCY_CONFLICT", "This command intent has different input.");
      return previous;
    }
    if (terminalRunStatuses.has(run.status)) fail("RUN_TERMINAL", "Run has already ended.");
    if (
      input.type === "steer" &&
      (typeof input.payload.prompt !== "string" || !input.payload.prompt.trim())
    )
      fail("COMMAND_INVALID", "Steering prompt is required.");
    if (
      input.type === "approval" &&
      (run.status !== "waiting_for_approval" ||
        input.payload.approvalId !== run.pendingApprovalId ||
        !["approve", "deny"].includes(String(input.payload.decision)))
    )
      fail("COMMAND_INVALID", "Approval is not pending for this run.");
    const timestamp = now();
    const queuedCancel = input.type === "cancel" && run.claimId === null;
    const command: RunCommand = {
      id: id(),
      runId: run.id,
      requestedByUserId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      type: input.type,
      payload: input.payload,
      status: queuedCancel ? "applied" : "pending",
      error: null,
      createdAt: timestamp,
      acknowledgedAt: queuedCancel ? timestamp : null,
    };
    if (queuedCancel)
      await tx.saveRun({
        ...run,
        status: "cancelled",
        completedAt: timestamp,
        updatedAt: timestamp,
      });
    await tx.saveCommand(command);
    return command;
  };
  const attach = async (
    tx: ExecutionTransaction,
    run: TaskRun,
    assetVersionId: string,
    name: string,
    artifactId = id(),
  ) => {
    const version = await options.assetVersions.getById(assetVersionId);
    if (!version || version.projectId !== run.projectId)
      fail("EXECUTION_ACCESS_DENIED", "Artifact version access denied.");
    const existing = (await tx.listArtifacts(run.id)).find(
      (artifact) => artifact.assetVersionId === assetVersionId || artifact.id === artifactId,
    );
    if (existing) return existing;
    const artifact: RunArtifact = {
      id: artifactId,
      runId: run.id,
      assetVersionId,
      name,
      createdAt: now(),
    };
    await tx.saveArtifact(artifact);
    return artifact;
  };
  return {
    async authenticateDevice(credential: string): Promise<PublicExecutionDevice> {
      const hash = await options.hashCredential(credential);
      return repository.read(async (tx) => {
        const device = await tx.findDeviceByHash(hash);
        if (!device || device.revokedAt)
          fail("DEVICE_UNAUTHORIZED", "Device credential is invalid.");
        return publicDevice(device!);
      });
    },
    async registerDevice(input: {
      actorId: string;
      name: string;
      platform: string;
      idempotencyKey: string;
    }) {
      const credential = await options.issueCredential(input.actorId, input.idempotencyKey);
      const credentialHash = await options.hashCredential(credential);
      return repository.transaction(async (tx) => {
        const existing = (await tx.listDevices(input.actorId)).find(
          (device) => device.registrationKey === input.idempotencyKey,
        );
        if (existing) {
          if (
            existing.name !== input.name ||
            existing.platform !== input.platform ||
            existing.revokedAt
          )
            fail("IDEMPOTENCY_CONFLICT", "Registration input differs or device was revoked.");
          return { device: publicDevice(existing), credential };
        }
        const timestamp = now();
        const device: ExecutionDevice = {
          id: id(),
          ownerUserId: input.actorId,
          name: input.name,
          platform: input.platform,
          registrationKey: input.idempotencyKey,
          credentialHash,
          revokedAt: null,
          lastSeenAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await tx.saveDevice(device);
        return { device: publicDevice(device), credential };
      });
    },
    listDevices: ({ actorId }: { actorId: string }) =>
      repository.read(async (tx) => ({ items: (await tx.listDevices(actorId)).map(publicDevice) })),
    revokeDevice: ({ actorId, deviceId }: { actorId: string; deviceId: string }) =>
      repository.transaction(async (tx) => {
        const device = await tx.getDevice(deviceId);
        if (!device || device.ownerUserId !== actorId)
          fail("EXECUTION_ACCESS_DENIED", "Device owner is required.");
        if (device!.revokedAt) return publicDevice(device!);
        const updated = { ...device!, revokedAt: now(), updatedAt: now() };
        await tx.saveDevice(updated);
        return publicDevice(updated);
      }),
    bindProject: (input: {
      actorId: string;
      deviceId: string;
      projectId: string;
      localBindingId: string;
      tools: string[];
      model: DeviceProjectBinding["model"];
      enabled: boolean;
    }) =>
      repository.transaction(async (tx) => {
        await ownedDevice(tx, input.actorId, input.deviceId);
        await access.assertCapability({
          actorId: input.actorId,
          projectId: input.projectId,
          capability: "project.manage",
        });
        const existing = await tx.getBinding(input.deviceId, input.projectId);
        const record = {
          deviceId: input.deviceId,
          projectId: input.projectId,
          localBindingId: input.localBindingId,
          tools: input.tools,
          model: input.model,
          enabled: input.enabled,
        };
        if (existing && same({ ...existing, updatedAt: null }, { ...record, updatedAt: null }))
          return existing;
        const binding = { ...record, updatedAt: now() };
        await tx.saveBinding(binding);
        return binding;
      }),
    listBindings: ({ actorId, deviceId }: { actorId: string; deviceId: string }) =>
      repository.read(async (tx) => {
        await ownedDevice(tx, actorId, deviceId);
        return { items: await tx.listBindings(deviceId) };
      }),
    heartbeat: ({ deviceId }: { deviceId: string }) =>
      repository.transaction(async (tx) => {
        const device = await requireDevice(tx, deviceId);
        const updated = { ...device, lastSeenAt: now(), updatedAt: now() };
        await tx.saveDevice(updated);
        return publicDevice(updated);
      }),
    create: (input: RunIntent) => repository.transaction((tx) => createRun(tx, input)),
    get: ({ actorId, runId }: { actorId: string; runId: string }) =>
      repository.read(async (tx) => publicRun(await readableRun(tx, actorId, runId))),
    list: ({
      actorId,
      projectId,
      taskId,
      limit = 50,
    }: {
      actorId: string;
      projectId: string;
      taskId?: string;
      limit?: number;
    }) =>
      repository.read(async (tx) => {
        await access.assertCapability({ actorId, projectId, capability: "project.read" });
        return {
          items: (await tx.listRuns(projectId, taskId))
            .sort(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
            )
            .slice(0, limit)
            .map(publicRun),
        };
      }),
    retry: ({
      actorId,
      runId,
      idempotencyKey,
    }: {
      actorId: string;
      runId: string;
      idempotencyKey: string;
    }) =>
      repository.transaction(async (tx) => {
        const run = await controlledRun(tx, actorId, runId);
        if (run.status !== "failed" && run.status !== "cancelled")
          fail("RUN_TERMINAL", "Only confirmed failed or cancelled runs may retry.");
        return createRun(
          tx,
          {
            actorId,
            projectId: run.projectId,
            taskId: run.taskId,
            targetDeviceId: run.targetDeviceId,
            prompt: run.prompt,
            input: run.input,
            idempotencyKey,
          },
          run,
        );
      }),
    cancel: (input: { actorId: string; runId: string; idempotencyKey: string }) =>
      repository.transaction(async (tx) => {
        const command = await createCommand(tx, { ...input, type: "cancel", payload: {} });
        return { run: publicRun(await requireRun(tx, input.runId)), command };
      }),
    createCommand: (input: Parameters<typeof createCommand>[1]) =>
      repository.transaction((tx) => createCommand(tx, input)),
    listCommands: ({ actorId, runId }: { actorId: string; runId: string }) =>
      repository.read(async (tx) => {
        await readableRun(tx, actorId, runId);
        return { items: await tx.listCommands(runId) };
      }),
    claim: ({ deviceId }: { deviceId: string }) =>
      repository.transaction(async (tx) => {
        const device = await requireDevice(tx, deviceId);
        // Unaccepted claims are redelivered to the same device. Ownership never expires.
        const candidates = (await tx.listDeviceRuns(deviceId))
          .filter((run) => run.dispatchReady && run.status === "queued" && !run.acceptedAt)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        for (const run of candidates) {
          const binding = await tx.getBinding(deviceId, run.projectId);
          if (!binding?.enabled) continue;
          await access.assertCapability({
            actorId: device.ownerUserId,
            projectId: run.projectId,
            capability: "project.write",
          });
          const claimed = run.claimId ? run : { ...run, claimId: id(), updatedAt: now() };
          if (!run.claimId) await tx.saveRun(claimed);
          return { run: publicRun(claimed), binding, claimId: claimed.claimId! };
        }
        return null;
      }),
    acknowledge: (input: DeviceRunInput) =>
      repository.transaction(async (tx) => {
        const run = await deviceRun(tx, input, false);
        if (run.acceptedAt) return publicRun(run);
        if (run.status !== "queued") fail("RUN_TERMINAL", "Run cannot start.");
        const commands = await tx.listCommands(run.id);
        if (commands.some((command) => command.type === "cancel" && command.status === "pending"))
          fail("RUN_TERMINAL", "Cancellation is pending; do not start this run.");
        const timestamp = now();
        const accepted = {
          ...run,
          status: "running" as const,
          acceptedAt: timestamp,
          updatedAt: timestamp,
        };
        await tx.saveRun(accepted);
        return publicRun(accepted);
      }),
    appendEvents: (input: DeviceRunInput & { events: RunEvent[] }) =>
      repository.transaction(async (tx) => {
        let run = await deviceRun(tx, input);
        for (const event of input.events) {
          if (event.runId !== run.id) fail("RUN_EVENT_CONFLICT", "Event belongs to another run.");
          if (event.seq <= run.lastSeq) {
            if (!same(await tx.getEvent(run.id, event.seq), event))
              fail("RUN_EVENT_CONFLICT", "Sequence was already used by another event.");
            continue;
          }
          if (event.seq !== run.lastSeq + 1)
            fail("RUN_EVENT_GAP", "Events must form a contiguous journal.");
          if (
            terminalRunStatuses.has(run.status) &&
            event.type !== "run.status" &&
            event.type !== "artifact.created"
          )
            fail("RUN_TERMINAL", "New events cannot follow a terminal run.");
          const timestamp = now();
          if (event.type === "run.status") {
            assertRunTransition(run.status, event.payload.status);
            run = {
              ...run,
              status: event.payload.status,
              error: event.payload.error ?? run.error,
              output: event.payload.output ?? run.output,
              completedAt: terminalRunStatuses.has(event.payload.status) ? timestamp : null,
            };
          } else if (event.type === "approval.requested") {
            if (run.status !== "running")
              fail("RUN_INVALID_TRANSITION", "Approval can only pause a running run.");
            run = {
              ...run,
              status: "waiting_for_approval",
              pendingApprovalId: event.payload.approvalId,
            };
          } else if (event.type === "approval.resolved") {
            const applied = (await tx.listCommands(run.id)).some(
              (command) =>
                command.type === "approval" &&
                command.status === "applied" &&
                command.payload.approvalId === event.payload.approvalId &&
                command.payload.decision === event.payload.decision,
            );
            if (!applied || run.pendingApprovalId !== event.payload.approvalId)
              fail("COMMAND_INVALID", "Approval has not been confirmed by the runner.");
            run = {
              ...run,
              status: event.payload.decision === "approve" ? "running" : "cancelled",
              pendingApprovalId: null,
              completedAt: event.payload.decision === "deny" ? timestamp : null,
            };
          } else if (event.type === "artifact.created")
            await attach(tx, run, event.payload.assetVersionId, event.payload.name);
          await tx.appendEvent(event);
          run = { ...run, lastSeq: event.seq, updatedAt: timestamp };
          await tx.saveRun(run);
        }
        return { acknowledgedSeq: run.lastSeq };
      }),
    events: ({
      actorId,
      runId,
      afterSeq = 0,
      limit = 100,
    }: {
      actorId: string;
      runId: string;
      afterSeq?: number;
      limit?: number;
    }) =>
      repository.read(async (tx) => {
        const run = await readableRun(tx, actorId, runId);
        const events = await tx.listEvents(runId, afterSeq, limit);
        const nextSeq = events.at(-1)?.seq ?? afterSeq;
        return { items: events, nextSeq, hasMore: nextSeq < run.lastSeq };
      }),
    snapshot: ({ actorId, runId }: { actorId: string; runId: string }) =>
      repository.read(async (tx) => {
        const run = await readableRun(tx, actorId, runId);
        const after = Math.max(0, run.lastSeq - 500);
        const [events, commands, artifacts] = await Promise.all([
          tx.listEvents(runId, after, 500),
          tx.listCommands(runId),
          tx.listArtifacts(runId),
        ]);
        return {
          run: publicRun(run),
          events,
          commands,
          artifacts,
          earliestSeq: events[0]?.seq ?? 0,
          historyTruncated: after > 0,
        };
      }),
    runnerCommands: (input: DeviceRunInput) =>
      repository.read(async (tx) => {
        await deviceRun(tx, input, false);
        return {
          items: (await tx.listCommands(input.runId)).filter(
            (command) => command.status === "pending",
          ),
        };
      }),
    acknowledgeCommand: (
      input: DeviceRunInput & {
        commandId: string;
        outcome: "applied" | "rejected";
        error?: string;
      },
    ) =>
      repository.transaction(async (tx) => {
        const run = await deviceRun(tx, input, false);
        const command = (await tx.listCommands(run.id)).find(
          (entry) => entry.id === input.commandId,
        );
        if (!command) fail("COMMAND_INVALID", "Command was not found.");
        if (command!.status !== "pending") {
          if (command!.status !== input.outcome)
            fail("COMMAND_INVALID", "Command has already been acknowledged differently.");
          return command!;
        }
        const timestamp = now();
        const tooLate =
          terminalRunStatuses.has(run.status) &&
          !(command!.type === "cancel" && run.status === "cancelled");
        const updated: RunCommand = {
          ...command!,
          status: tooLate ? "rejected" : input.outcome,
          error: tooLate ? "run_already_ended" : (input.error ?? null),
          acknowledgedAt: timestamp,
        };
        if (!tooLate && command!.type === "cancel" && input.outcome === "applied")
          await tx.saveRun({
            ...run,
            status: "cancelled",
            completedAt: timestamp,
            updatedAt: timestamp,
          });
        await tx.saveCommand(updated);
        return updated;
      }),
    listArtifacts: ({ actorId, runId }: { actorId: string; runId: string }) =>
      repository.read(async (tx) => {
        await readableRun(tx, actorId, runId);
        return { items: await tx.listArtifacts(runId) };
      }),
    attachArtifact: ({
      actorId,
      runId,
      assetVersionId,
      name,
    }: {
      actorId: string;
      runId: string;
      assetVersionId: string;
      name: string;
    }) =>
      repository.transaction(async (tx) =>
        attach(tx, await controlledRun(tx, actorId, runId), assetVersionId, name),
      ),
    async uploadArtifact(
      input: DeviceRunInput & {
        name: string;
        body: Uint8Array;
        contentType: string;
        checksum: string;
        idempotencyKey: string;
      },
    ) {
      const artifactId = `run-artifact-${input.runId}-${input.idempotencyKey}`;
      const run = await repository.read(async (tx) => {
        const run = await deviceRun(tx, input);
        const previous = (await tx.listArtifacts(run.id)).find((entry) => entry.id === artifactId);
        return { run, previous };
      });
      if (run.previous) return run.previous;
      if (!options.assets) throw new Error("Artifact uploads are not configured.");
      const actorId = run.run.requestedByUserId;
      const projectId = run.run.projectId;
      const asset = await options.assets.createAsset({ actorId, projectId, name: input.name });
      const upload = await options.assets.createAssetUpload({
        actorId,
        projectId,
        byteSize: input.body.byteLength,
        contentType: input.contentType,
        expectedHash: input.checksum,
      });
      const version = await options.assets.completeAssetUpload({
        actorId,
        assetId: asset.id,
        uploadId: upload.id,
        byteSize: input.body.byteLength,
        contentType: input.contentType,
        checksum: input.checksum,
        body: input.body,
      });
      return repository.transaction(async (tx) =>
        attach(tx, await deviceRun(tx, input), version.id, input.name, artifactId),
      );
    },
  };
}
export type ExecutionApplication = ReturnType<typeof createExecutionApplication>;
