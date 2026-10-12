import { publicCloudEvent } from "./public-events.js";
import {
  CloudDomainError,
  canProjectCapabilityV2,
  resolveProjectAccessV2,
  defaultClock,
  defaultIdGenerator,
  defaultCloudLimits,
  isCloudTerminal,
  sameResourceScope,
  type CloudRepository,
  type CloudTransaction,
  type CloudResource,
  type ResourceScope,
  type CloudLimits,
  type CloudRun,
  type CloudRunStatus,
  type CloudMode,
  type CloudRunEvent,
  type CloudAssetVersion,
  type CloudTask,
  type CloudNotification,
  type CloudArtifactRevision,
  type CloudTaskRound,
} from "@voidmix/core";

export type Actor = { actorId: string };
export type Intent = { idempotencyKey: string };
export type Fence = { runId: string; ownerId: string; epoch: number };
export interface CloudApplicationOptions {
  repository: CloudRepository;
  now?: () => Date;
  id?: () => string;
  limits?: Partial<CloudLimits>;
  admitRun?: (input: Actor & { mode: CloudMode }) => Promise<void>;
}
export function createCloudContext(options: CloudApplicationOptions) {
  const repo = options.repository;
  const now = options.now ?? (() => defaultClock.now());
  const id = options.id ?? (() => defaultIdGenerator.next());
  const limits = { ...defaultCloudLimits, ...options.limits };
  for (const value of Object.values(limits))
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new CloudDomainError("CLOUD_INVALID_INPUT", "Limits must be positive safe integers.");
  const canonicalJson = (value: unknown): string => {
    const sorted = (input: unknown): unknown => {
      if (input instanceof Date) return input.toISOString();
      if (Array.isArray(input)) return input.map(sorted);
      if (input && typeof input === "object")
        return Object.fromEntries(
          Object.entries(input)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, sorted(child)]),
        );
      return input;
    };
    return JSON.stringify(sorted(value));
  };
  const payloadText = (value: unknown, fallback = ""): string =>
    typeof value === "string" ? value : fallback;
  const fail = (
    code: ConstructorParameters<typeof CloudDomainError>[0],
    message: string,
  ): never => {
    throw new CloudDomainError(code, message);
  };
  const required = <T>(value: T | null): T =>
    value ?? fail("CLOUD_ACCESS_DENIED", "Resource unavailable.");
  const text = (value: string): string =>
    value.length > 65536
      ? fail("CLOUD_INVALID_INPUT", "Text exceeds the input limit.")
      : value.trim() || fail("CLOUD_INVALID_INPUT", "Text is required.");
  const base = (scope: ResourceScope): CloudResource => {
    const time = now();
    return { id: id(), scope, createdAt: time, updatedAt: time };
  };
  const access = async (
    tx: CloudTransaction,
    actorId: string,
    scope: ResourceScope,
    write = false,
  ) => {
    if (!(await tx.userActive(actorId))) fail("CLOUD_ACCESS_DENIED", "Account unavailable.");
    if (scope.type === "personal") {
      if (scope.ownerUserId !== actorId) fail("CLOUD_ACCESS_DENIED", "Resource unavailable.");
      return;
    }
    const context = required(await tx.projectAccess(scope.projectId, actorId));
    if (
      !canProjectCapabilityV2(
        resolveProjectAccessV2({ actorId, ...context }),
        write ? "project.write" : "project.read",
      )
    )
      fail("CLOUD_ACCESS_DENIED", "Resource unavailable.");
    if (write && context.project.archived)
      fail("CLOUD_ACCESS_DENIED", "Archived project is read-only.");
  };
  const scopeFor = (input: Actor & { projectId?: string }): ResourceScope =>
    input.projectId
      ? { type: "project", projectId: input.projectId }
      : { type: "personal", ownerUserId: input.actorId };
  const spendingAccount = async (tx: CloudTransaction, actorId: string, scope: ResourceScope) => {
    await access(tx, actorId, scope, true);
    if (scope.type === "personal") return `user:${scope.ownerUserId}`;
    const context = required(await tx.projectAccess(scope.projectId, actorId));
    const explicit = await tx.get("spendingGrants", `${scope.projectId}:${actorId}`);
    const manages = canProjectCapabilityV2(
      resolveProjectAccessV2({ actorId, ...context }),
      "project.manage",
    );
    if (explicit ? !explicit.allowed : !manages)
      fail("CLOUD_ACCESS_DENIED", "Project model spending permission required.");
    if (context.project.personalOwnerId && !(await tx.userActive(context.project.personalOwnerId)))
      fail("CLOUD_ACCESS_DENIED", "Funding account unavailable.");
    return context.project.personalOwnerId
      ? `user:${context.project.personalOwnerId}`
      : `organization:${required(context.project.organizationId)}`;
  };
  const validateAttachments = async (
    tx: CloudTransaction,
    actorId: string,
    scope: ResourceScope,
    attachmentIds: readonly string[],
  ) => {
    if (attachmentIds.length > 20) fail("CLOUD_INVALID_INPUT", "Too many attachments.");
    for (const attachmentId of attachmentIds) {
      const asset = required(await tx.get("assets", attachmentId));
      if (!asset.published || !sameResourceScope(asset.scope, scope))
        fail("CLOUD_ACCESS_DENIED", "Attachment is unavailable.");
      await access(tx, actorId, asset.scope);
    }
  };
  const roundIn = async (
    tx: CloudTransaction,
    task: CloudTask,
    input: Actor & Intent & { goal: string; attachmentIds: string[] },
  ) => {
    await validateAttachments(tx, input.actorId, task.scope, input.attachmentIds);
    const round: CloudTaskRound = {
      ...base(task.scope),
      taskId: task.id,
      goalVersion: task.goalVersion + 1,
      goal: text(input.goal),
      attachmentIds: [...new Set(input.attachmentIds)],
      callBudget: limits.taskCalls,
      durationBudgetMs: limits.taskDurationMs,
      createdByUserId: input.actorId,
      idempotencyKey: input.idempotencyKey,
    };
    await tx.save("rounds", round);
    task.goal = round.goal;
    task.goalVersion = round.goalVersion;
    task.currentRoundId = round.id;
    task.currentRevisionId = null;
    task.acceptedRevisionId = null;
    task.status = "open";
    task.updatedAt = now();
    await tx.save("tasks", task);
    return round;
  };
  const mutate = async <T>(
    tx: CloudTransaction,
    input: Actor & Intent,
    scope: ResourceScope,
    operation: string,
    body: unknown,
    work: () => Promise<T>,
  ): Promise<T> => {
    const fingerprint = canonicalJson(body);
    const previous = (
      await tx.list("mutations", { actorId: input.actorId, idempotencyKey: input.idempotencyKey })
    )[0];
    if (previous) {
      if (
        previous.operation !== operation ||
        previous.fingerprint !== fingerprint ||
        !sameResourceScope(previous.scope, scope)
      )
        fail("CLOUD_IDEMPOTENCY_CONFLICT", "Mutation key was reused.");
      return previous.response as T;
    }
    const response = await work();
    await tx.save("mutations", {
      ...base(scope),
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      operation,
      fingerprint,
      response,
    });
    return response;
  };
  const runFor = async (tx: CloudTransaction, runId: string, actorId: string, write = false) => {
    const run = required(await tx.get("runs", runId));
    await access(tx, actorId, run.scope, write);
    return run;
  };
  const fenced = async (tx: CloudTransaction, fence: Fence, authorize = true) => {
    const run = required(await tx.get("runs", fence.runId));
    if (
      run.ownerId !== fence.ownerId ||
      run.epoch !== fence.epoch ||
      run.status !== "running" ||
      !run.leaseExpiresAt ||
      run.leaseExpiresAt.getTime() <= now().getTime()
    )
      fail("CLOUD_OWNER_INVALID", "Execution ownership has changed.");
    if (
      authorize &&
      (await spendingAccount(tx, run.requestedByUserId, run.scope)) !== run.ownerAccountId
    )
      fail("CLOUD_ACCESS_DENIED", "Spending owner changed.");
    return run;
  };
  const event = async (
    tx: CloudTransaction,
    run: CloudRun,
    input: Pick<CloudRunEvent, "type" | "payload"> & {
      eventId?: string;
      executionId?: string | null;
    },
  ) => {
    const duplicate = input.eventId ? await tx.eventById(run.id, input.eventId) : null;
    if (duplicate) {
      if (
        duplicate.type !== input.type ||
        duplicate.executionId !== (input.executionId ?? null) ||
        canonicalJson(duplicate.payload) !== canonicalJson(input.payload)
      )
        fail("CLOUD_IDEMPOTENCY_CONFLICT", "Event key was reused.");
      return duplicate;
    }
    const entry: CloudRunEvent = {
      runId: run.id,
      sequence: run.lastSequence + 1,
      occurredAt: now(),
      type: input.type,
      payload: input.payload,
      executionId: input.executionId ?? null,
      eventId: input.eventId ?? id(),
    };
    if (entry.executionId) {
      const execution = required(await tx.get("executions", entry.executionId));
      if (execution.runId !== run.id) fail("CLOUD_ACCESS_DENIED", "Event execution mismatch.");
    }
    if (entry.type === "message.delta" || entry.type === "message.completed") {
      const messageId = payloadText(
        entry.payload["messageId"],
        `${entry.executionId ?? "root"}:assistant`,
      );
      const key = `${run.id}:${messageId}`;
      const prior = await tx.get("messages", key);
      const completed = entry.type === "message.completed";
      await tx.save("messages", {
        ...(prior ?? base(run.scope)),
        id: key,
        runId: run.id,
        messageId,
        executionId: entry.executionId,
        text: completed
          ? payloadText(entry.payload["text"])
          : prior?.completed
            ? prior.text
            : `${prior?.text ?? ""}${payloadText(entry.payload["text"], payloadText(entry.payload["delta"]))}`,
        completed: completed || (prior?.completed ?? false),
        sequence: entry.sequence,
        updatedAt: now(),
      });
    }
    if (entry.type === "source.created") {
      const sourceId =
        typeof entry.payload["id"] === "string" ? entry.payload["id"] : entry.eventId;
      const prior = await tx.get("sources", sourceId);
      if (prior && prior.runId !== run.id) fail("CLOUD_ACCESS_DENIED", "Source mismatch.");
      const url = entry.payload["url"];
      if (typeof url !== "string" || !/^https?:\/\//.test(url))
        fail("CLOUD_INVALID_INPUT", "Invalid source URL.");
      await tx.save("sources", {
        ...base(run.scope),
        id: sourceId,
        runId: run.id,
        url: String(url),
        title: payloadText(entry.payload["title"]),
        excerpt: payloadText(entry.payload["excerpt"]),
      });
    }
    if (entry.type === "tool.started") {
      const callId = entry.payload["callId"];
      if (typeof callId !== "string" || !entry.executionId)
        fail("CLOUD_INVALID_INPUT", "Tool identity missing.");
      const toolId = String(callId);
      const execution = required(await tx.get("executions", required(entry.executionId)));
      if (execution.runId !== run.id) fail("CLOUD_ACCESS_DENIED", "Tool execution mismatch.");
      const prior = await tx.get("tools", toolId);
      if (prior && prior.runId !== run.id) fail("CLOUD_ACCESS_DENIED", "Tool mismatch.");
      await tx.save("tools", {
        ...base(run.scope),
        id: toolId,
        runId: run.id,
        executionId: execution.id,
        name: payloadText(entry.payload["name"], "unknown"),
        input: entry.payload["input"] ?? null,
        output: null,
        status: "running",
      });
    }
    if (entry.type === "tool.completed") {
      const tool = required(await tx.get("tools", String(entry.payload["callId"])));
      if (tool.runId !== run.id) fail("CLOUD_ACCESS_DENIED", "Tool mismatch.");
      tool.output = entry.payload["output"] ?? null;
      tool.status = entry.payload["isError"] ? "failed" : "succeeded";
      tool.updatedAt = now();
      await tx.save("tools", tool);
    }
    await tx.appendEvent(entry);
    run.lastSequence = entry.sequence;
    run.updatedAt = now();
    await tx.save("runs", run);
    return entry;
  };
  const notifyFact = async (
    tx: CloudTransaction,
    fact: {
      scope: ResourceScope;
      recipientId: string;
      taskId: string | null;
      conversationId: string | null;
      runId: string | null;
      type: CloudNotification["type"];
      key: string;
    },
  ) => {
    const preferences = await tx.get("preferences", fact.recipientId);
    const notification: CloudNotification = {
      ...base(fact.scope),
      id: fact.key,
      recipientId: fact.recipientId,
      taskId: fact.taskId,
      conversationId: fact.conversationId,
      runId: fact.runId,
      type: fact.type,
      readAt: null,
      emailEnabled: preferences?.emailEnabled ?? false,
      emailDeliveredAt: null,
    };
    if (await tx.get("notifications", notification.id)) return;
    await tx.save("notifications", notification);
    await tx.enqueue({
      id: `cloud.notification.created:${notification.id}`,
      type: "cloud.notification.created",
      payload: { notificationId: notification.id },
    });
  };
  const notify = async (
    tx: CloudTransaction,
    task: CloudTask,
    type: CloudNotification["type"],
    runId: string | null,
  ) =>
    notifyFact(tx, {
      scope: task.scope,
      recipientId: task.requestedByUserId,
      taskId: task.id,
      conversationId: task.conversationId,
      runId,
      type,
      key: `${type}:${task.id}:${runId ?? task.acceptedRevisionId}`,
    });
  const usageFor = async (tx: CloudTransaction, accountId: string) => {
    const ownerAccountId = accountId.includes(":") ? accountId : `user:${accountId}`;
    const time = now();
    const monthStart = Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), 1);
    const monthEnd = Date.UTC(time.getUTCFullYear(), time.getUTCMonth() + 1, 1);
    const calls = (await tx.list("usage", { ownerAccountId })).filter(
      (call) => call.createdAt.getTime() >= monthStart && call.createdAt.getTime() < monthEnd,
    );
    const assets = await tx.list("assets", { ownerAccountId });
    const runs = await tx.list("runs", { ownerAccountId });
    return {
      calls: calls.filter((call) => call.state !== "released").length,
      reservedCalls: calls.filter((call) => call.state === "reserved").length,
      unknownCalls: calls.filter((call) => call.state === "unknown").length,
      inputTokens: calls.reduce((n, c) => n + (c.inputTokens ?? 0), 0),
      outputTokens: calls.reduce((n, c) => n + (c.outputTokens ?? 0), 0),
      estimatedCost: calls.reduce((n, c) => n + (c.estimatedCost ?? 0), 0),
      storageBytes: assets.reduce((n, a) => n + a.byteSize, 0),
      activeRuns: runs.filter((run) => !isCloudTerminal(run.status)).length,
      limits,
    };
  };
  const queue = async (
    tx: CloudTransaction,
    input: Actor & {
      conversationId: string;
      turnId: string;
      taskId: string | null;
      mode: CloudMode;
      prompt: string;
      attachmentIds: string[];
      scope: ResourceScope;
      retryOf?: CloudRun;
      roundId?: string;
      goalVersion?: number;
    },
  ) => {
    const ownerAccountId = await spendingAccount(tx, input.actorId, input.scope);
    await tx.lock([
      `account:${ownerAccountId}`,
      `actor:${input.actorId}`,
      ...(input.taskId ? [`task:${input.taskId}`] : []),
    ]);
    const usage = await usageFor(tx, ownerAccountId);
    if (usage.activeRuns >= limits.accountConcurrentRuns || usage.calls >= limits.accountCalls)
      fail("CLOUD_BUDGET_EXCEEDED", "Account execution quota exhausted.");
    let round: CloudTaskRound | null = null;
    if (input.taskId) {
      const task = required(await tx.get("tasks", input.taskId));
      await access(tx, input.actorId, task.scope, true);
      if (
        !sameResourceScope(task.scope, input.scope) ||
        task.status === "cancelled" ||
        task.status === "completed" ||
        task.acceptedRevisionId !== null
      )
        fail("CLOUD_INVALID_INPUT", "Task scope or state mismatch.");
      round = required(await tx.get("rounds", task.currentRoundId));
      if (
        (input.roundId && input.roundId !== round.id) ||
        (input.goalVersion !== undefined && input.goalVersion !== task.goalVersion) ||
        (input.retryOf && input.retryOf.roundId !== round.id)
      )
        fail("CLOUD_REVISION_INVALID", "Task goal has changed.");
      if (await tx.activeTaskRun(input.taskId))
        fail("CLOUD_RUN_ACTIVE", "Task already has an active run.");
      if (task.conversationId && task.conversationId !== input.conversationId)
        fail("CLOUD_INVALID_INPUT", "Task belongs to another conversation.");
      task.conversationId = input.conversationId;
      task.status = "in_progress";
      task.updatedAt = now();
      await tx.save("tasks", task);
    }
    const attachmentIds = [...new Set([...(round?.attachmentIds ?? []), ...input.attachmentIds])];
    await validateAttachments(tx, input.actorId, input.scope, attachmentIds);
    const run: CloudRun = {
      ...base(input.scope),
      conversationId: input.conversationId,
      turnId: input.turnId,
      sourceTurnId: input.retryOf?.sourceTurnId ?? input.retryOf?.turnId ?? input.turnId,
      taskId: input.taskId,
      roundId: round?.id ?? null,
      ownerAccountId,
      requestedByUserId: input.actorId,
      mode: input.mode,
      prompt: input.prompt,
      attachmentIds,
      status: "queued",
      attempt: (input.retryOf?.attempt ?? 0) + 1,
      retryOfRunId: input.retryOf?.id ?? null,
      lastSequence: 0,
      ownerId: null,
      epoch: 0,
      heartbeatAt: null,
      leaseExpiresAt: null,
      startedAt: null,
      completedAt: null,
      cancelRequested: false,
      output: null,
      error: null,
      dispatchReady: false,
    };
    await tx.save("runs", run);
    await tx.enqueue({
      id: `cloud.run.queued:${run.id}`,
      type: "cloud.run.queued",
      payload: { runId: run.id },
    });
    return run;
  };
  const snapshot = async (tx: CloudTransaction, run: CloudRun, publicView = false) => {
    const allEvents = await tx.events(run.id, Math.max(0, run.lastSequence - 200), 200);
    return {
      run,
      events: allEvents.map((event) => (publicView ? publicCloudEvent(event) : event)),
      messages: await tx.list("messages", { parentId: run.id }),
      executions: await tx.list("executions", { parentId: run.id }),
      sources: await tx.list("sources", { parentId: run.id }),
      artifacts: (await tx.list("assets", { parentId: run.id })).filter((a) => a.published),
      commands: await tx.list("commands", { parentId: run.id }),
      cursor: run.lastSequence,
      historyTruncated: run.lastSequence > allEvents.length,
      historyCursor: run.lastSequence > allEvents.length ? (allEvents[0]?.sequence ?? null) : null,
    };
  };
  const runTransaction = async <T>(
    runId: string,
    operation: (tx: CloudTransaction) => Promise<T>,
    extraKeys: readonly string[] = [],
  ): Promise<T> => {
    const run = required(await repo.read((tx) => tx.get("runs", runId)));
    return repo.transaction(
      [
        `account:${run.ownerAccountId}`,
        `actor:${run.requestedByUserId}`,
        `run:${runId}`,
        ...(run.taskId ? [`task:${run.taskId}`] : []),
        ...extraKeys,
      ],
      operation,
    );
  };
  const finishIn = async (
    tx: CloudTransaction,
    run: CloudRun,
    status: Extract<CloudRunStatus, "succeeded" | "failed" | "needs_input" | "cancelled">,
    output?: string,
    error?: string,
  ) => {
    if (status === "succeeded" && run.taskId && !run.cancelRequested) {
      const task = required(await tx.get("tasks", run.taskId));
      const revision = task.currentRevisionId
        ? await tx.get("revisions", task.currentRevisionId)
        : null;
      if (!revision || revision.runId !== run.id)
        fail("CLOUD_REVISION_INVALID", "Computer must publish a delivery before succeeding.");
    }
    run.status = run.cancelRequested ? "cancelled" : status;
    run.output = run.cancelRequested ? null : (output ?? null);
    run.error = error ?? null;
    for (const command of await tx.list("commands", { parentId: run.id }))
      if (command.status === "pending") {
        command.status =
          command.type === "cancel" && run.status === "cancelled" ? "applied" : "rejected";
        command.updatedAt = now();
        await tx.save("commands", command);
      }
    run.completedAt = now();
    run.leaseExpiresAt = null;
    run.updatedAt = now();
    for (const child of await tx.list("executions", { parentId: run.id }))
      if (!isCloudTerminal(child.status)) {
        child.status = run.status === "cancelled" ? "cancelled" : "failed";
        child.updatedAt = now();
        await tx.save("executions", child);
      }
    for (const tool of await tx.list("tools", { parentId: run.id }))
      if (tool.status === "running") {
        tool.status = run.status === "cancelled" ? "cancelled" : "failed";
        tool.updatedAt = now();
        await tx.save("tools", tool);
      }
    for (const call of await tx.list("usage", { parentId: run.id }))
      if (call.state === "started" || call.state === "reserved") {
        call.state = call.state === "started" ? "unknown" : "released";
        if (call.state === "unknown" && call.pricing)
          call.estimatedCost =
            (call.reservedTokens * (call.pricing.inputPerMillion + call.pricing.outputPerMillion)) /
            1_000_000;
        call.settledAt = now();
        call.updatedAt = now();
        await tx.save("usage", call);
      }
    await event(tx, run, { type: "run.status", payload: { status: run.status, error: run.error } });
    if (run.taskId) {
      const task = required(await tx.get("tasks", run.taskId));
      if (task.status !== "cancelled") {
        task.status =
          run.status === "needs_input"
            ? "waiting_input"
            : run.status === "succeeded" && task.currentRevisionId
              ? "review"
              : "open";
        task.updatedAt = now();
        await tx.save("tasks", task);
        if (task.status === "review") await notify(tx, task, "task.review", run.id);
        else if (task.status === "waiting_input")
          await notify(tx, task, "task.waiting_input", run.id);
        else if (run.status === "failed") await notify(tx, task, "run.failed", run.id);
      }
    }
    if (!run.taskId && run.status === "failed")
      await notifyFact(tx, {
        scope: run.scope,
        recipientId: run.requestedByUserId,
        taskId: null,
        conversationId: run.conversationId,
        runId: run.id,
        type: "run.failed",
        key: `run.failed:${run.id}`,
      });
    return run;
  };
  const publishIn = async (
    tx: CloudTransaction,
    run: CloudRun,
    input: { assetVersionIds: string[]; summary: string },
  ): Promise<CloudArtifactRevision> => {
    if (!run.taskId || run.cancelRequested)
      fail("CLOUD_REVISION_INVALID", "Run cannot publish a delivery.");
    const task = required(await tx.get("tasks", required(run.taskId)));
    if (!run.roundId || task.currentRoundId !== run.roundId)
      fail("CLOUD_REVISION_INVALID", "Run belongs to an obsolete goal.");
    const existing = (await tx.list("revisions", { parentId: task.id })).find(
      (r) => r.runId === run.id,
    );
    if (existing) return existing;
    if (input.assetVersionIds.length === 0) fail("CLOUD_REVISION_INVALID", "Delivery is empty.");
    for (const assetId of input.assetVersionIds) {
      const asset = required(await tx.get("assets", assetId));
      if (
        asset.cleanupClaimed ||
        !asset.verifiedAt ||
        asset.runId !== run.id ||
        !sameResourceScope(asset.scope, run.scope)
      )
        fail("CLOUD_REVISION_INVALID", "Delivery files are not ready.");
      asset.published = true;
      asset.updatedAt = now();
      await tx.save("assets", asset);
    }
    const revision = {
      ...base(run.scope),
      taskId: task.id,
      roundId: required(run.roundId),
      goalVersion: task.goalVersion,
      runId: run.id,
      assetVersionIds: [...new Set(input.assetVersionIds)],
      summary: input.summary,
      revision: (await tx.list("revisions", { parentId: task.id })).length + 1,
    };
    await tx.save("revisions", revision);
    task.currentRevisionId = revision.id;
    task.updatedAt = now();
    await tx.save("tasks", task);
    await event(tx, run, {
      type: "artifact.published",
      payload: { revisionId: revision.id, assetVersionIds: revision.assetVersionIds },
    });
    return revision;
  };
  const assetIn = async (
    tx: CloudTransaction,
    input: Actor &
      Intent & {
        scope: ResourceScope;
        name: string;
        mediaType: string;
        byteSize: number;
        checksum: string;
        runId: string | null;
      },
  ) => {
    const ownerAccountId = await spendingAccount(tx, input.actorId, input.scope);
    await tx.lock([`account:${ownerAccountId}`, `actor:${input.actorId}`]);
    await access(tx, input.actorId, input.scope, true);
    const duplicate = (
      await tx.list("assets", { actorId: input.actorId, idempotencyKey: input.idempotencyKey })
    )[0];
    if (duplicate) {
      if (
        duplicate.name !== input.name ||
        duplicate.byteSize !== input.byteSize ||
        duplicate.checksum !== input.checksum ||
        duplicate.mediaType !== input.mediaType ||
        duplicate.runId !== input.runId ||
        !sameResourceScope(duplicate.scope, input.scope)
      )
        fail("CLOUD_IDEMPOTENCY_CONFLICT", "Upload key was reused.");
      return duplicate;
    }
    if (
      !Number.isSafeInteger(input.byteSize) ||
      input.byteSize <= 0 ||
      input.byteSize > 10 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(input.checksum)
    )
      fail("CLOUD_INVALID_INPUT", "Invalid file size or checksum.");
    if (
      (await usageFor(tx, ownerAccountId)).storageBytes + input.byteSize >
      limits.accountStorageBytes
    )
      fail("CLOUD_BUDGET_EXCEEDED", "Storage quota exhausted.");
    const asset: CloudAssetVersion = {
      ...base(input.scope),
      requestedByUserId: input.actorId,
      ownerAccountId,
      name: text(input.name),
      objectKey: "",
      mediaType: input.mediaType,
      byteSize: input.byteSize,
      checksum: input.checksum,
      published: false,
      verifiedAt: null,
      cleanupClaimed: false,
      uploadId: id(),
      idempotencyKey: input.idempotencyKey,
      runId: input.runId,
      expiresAt: new Date(now().getTime() + 15 * 60 * 1000),
    };
    asset.objectKey = `cloud/${asset.id}/${asset.uploadId}`;
    await tx.save("assets", asset);
    return asset;
  };
  const completeAssetIn = async (
    tx: CloudTransaction,
    asset: CloudAssetVersion,
    input: { byteSize: number; checksum: string },
    publish = true,
  ) => {
    if (asset.cleanupClaimed) fail("CLOUD_INVALID_INPUT", "Upload was reclaimed.");
    if (asset.byteSize !== input.byteSize || asset.checksum !== input.checksum)
      fail("CLOUD_INVALID_INPUT", "Uploaded object does not match intent.");
    if (!asset.verifiedAt && asset.expiresAt.getTime() < now().getTime())
      fail("CLOUD_INVALID_INPUT", "Upload expired.");
    if (asset.verifiedAt && asset.published === publish) return asset;
    asset.verifiedAt = asset.verifiedAt ?? now();
    asset.published = publish;
    asset.updatedAt = now();
    await tx.save("assets", asset);
    return asset;
  };
  const requireAdmin = async (tx: CloudTransaction, actorId: string) => {
    if (!(await tx.userActive(actorId))) fail("CLOUD_ACCESS_DENIED", "Account unavailable.");
    const user = required(await tx.userProfile(actorId));
    if (user.role !== "admin" && user.role !== "owner")
      fail("CLOUD_ACCESS_DENIED", "Administrator permission required.");
  };
  const adminSummary = (run: CloudRun) => ({
    id: run.id,
    scope: run.scope,
    requestedByUserId: run.requestedByUserId,
    taskId: run.taskId,
    mode: run.mode,
    status: run.status,
    attempt: run.attempt,
    ownerId: run.ownerId,
    epoch: run.epoch,
    lastSequence: run.lastSequence,
    cancelRequested: run.cancelRequested,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    failureCode: run.error
      ? run.error === "interrupted"
        ? ("interrupted" as const)
        : run.error === "access_revoked"
          ? ("access_revoked" as const)
          : ("execution_failed" as const)
      : null,
  });
  return {
    repo,
    now,
    id,
    limits,
    options,
    fail,
    required,
    text,
    base,
    access,
    spendingAccount,
    roundIn,
    validateAttachments,
    scopeFor,
    mutate,
    runFor,
    fenced,
    event,
    notify,
    usageFor,
    queue,
    snapshot,
    runTransaction,
    finishIn,
    publishIn,
    assetIn,
    completeAssetIn,
    requireAdmin,
    adminSummary,
  };
}
export type CloudContext = ReturnType<typeof createCloudContext>;
