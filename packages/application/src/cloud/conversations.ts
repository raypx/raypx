import { cloudPage } from "./pagination.js";
import { sameResourceScope, type CloudMode } from "@voidmix/core";
import type { CloudContext, Actor, Intent } from "./context.js";

export function cloudConversations(context: CloudContext) {
  const {
    repo,
    now,
    options,
    fail,
    required,
    text,
    base,
    access,
    scopeFor,
    queue,
    roundIn,
    spendingAccount,
  } = context;
  return {
    createConversation: (input: Actor & Intent & { title: string; projectId?: string }) =>
      repo.transaction([`actor:${input.actorId}`], async (tx) => {
        const scope = scopeFor(input);
        await access(tx, input.actorId, scope, true);
        const existing = (
          await tx.list("conversations", {
            actorId: input.actorId,
            idempotencyKey: input.idempotencyKey,
          })
        )[0];
        if (existing) {
          if (existing.title !== input.title || !sameResourceScope(existing.scope, scope))
            fail("CLOUD_IDEMPOTENCY_CONFLICT", "Conversation key was reused.");
          return existing;
        }
        const conversation = {
          ...base(scope),
          title: text(input.title),
          createdByUserId: input.actorId,
          idempotencyKey: input.idempotencyKey,
        };
        await tx.save("conversations", conversation);
        return conversation;
      }),
    listConversations: (input: Actor & { projectId?: string; limit?: number; cursor?: string }) =>
      repo.read(async (tx) => {
        const scope = scopeFor(input);
        await access(tx, input.actorId, scope);
        return cloudPage(tx, input, "conversations", { scope });
      }),
    getConversation: (input: Actor & { conversationId: string }) =>
      repo.read(async (tx) => {
        const conversation = required(await tx.get("conversations", input.conversationId));
        await access(tx, input.actorId, conversation.scope);
        const history = await cloudPage(tx, { actorId: input.actorId, limit: 100 }, "turns", {
          parentId: conversation.id,
        });
        const recentRuns = await tx.list("runs", { parentId: conversation.id, limit: 100 });
        const associatedRuns = await tx.list("runs", {
          parentId: conversation.id,
          turnIds: history.items.map((turn) => turn.id),
        });
        const runs = [
          ...new Map([...recentRuns, ...associatedRuns].map((run) => [run.id, run])).values(),
        ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
        return { conversation, turns: history.items, runs, historyCursor: history.nextCursor };
      }),
    conversationHistory: (
      input: Actor & { conversationId: string; limit?: number; cursor?: string },
    ) =>
      repo.read(async (tx) => {
        const conversation = required(await tx.get("conversations", input.conversationId));
        await access(tx, input.actorId, conversation.scope);
        const page = await cloudPage(tx, input, "turns", { parentId: conversation.id });
        const runs = await tx.list("runs", {
          parentId: conversation.id,
          turnIds: page.items.map((turn) => turn.id),
        });
        return { ...page, runs };
      }),
    sendTurn: async (
      input: Actor &
        Intent & {
          conversationId: string;
          prompt: string;
          mode: CloudMode;
          taskId?: string;
          roundId?: string;
          goalVersion?: number;
          attachmentIds?: string[];
        },
    ) => {
      if (input.taskId && (!input.roundId || input.goalVersion === undefined))
        fail("CLOUD_INVALID_INPUT", "Task execution requires the current round and goal version.");
      const existing = await repo.read(
        async (tx) =>
          (
            await tx.list("turns", { actorId: input.actorId, idempotencyKey: input.idempotencyKey })
          )[0],
      );
      if (!existing) await options.admitRun?.({ actorId: input.actorId, mode: input.mode });
      const ownerAccountId = await repo.read(async (tx) => {
        const conversation = required(await tx.get("conversations", input.conversationId));
        return spendingAccount(tx, input.actorId, conversation.scope);
      });
      return repo.transaction(
        [
          `account:${ownerAccountId}`,
          `actor:${input.actorId}`,
          `conversation:${input.conversationId}`,
          ...(input.taskId ? [`task:${input.taskId}`] : []),
        ],
        async (tx) => {
          const conversation = required(await tx.get("conversations", input.conversationId));
          await access(tx, input.actorId, conversation.scope, true);
          const duplicate = (
            await tx.list("turns", { actorId: input.actorId, idempotencyKey: input.idempotencyKey })
          )[0];
          if (duplicate) {
            if (
              duplicate.conversationId !== input.conversationId ||
              duplicate.prompt !== input.prompt ||
              duplicate.mode !== input.mode ||
              (input.taskId !== undefined &&
                (await tx.get("runs", duplicate.runId))?.taskId !== input.taskId) ||
              (input.roundId !== undefined &&
                (await tx.get("runs", duplicate.runId))?.roundId !== input.roundId) ||
              (input.goalVersion !== undefined &&
                (await tx.get("rounds", input.roundId ?? ""))?.goalVersion !== input.goalVersion) ||
              JSON.stringify(duplicate.attachmentIds) !== JSON.stringify(input.attachmentIds ?? [])
            )
              fail("CLOUD_IDEMPOTENCY_CONFLICT", "Turn key was reused.");
            const run = required(await tx.get("runs", duplicate.runId));
            return {
              turn: duplicate,
              run,
              task: run.taskId ? await tx.get("tasks", run.taskId) : null,
            };
          }
          let task = input.taskId ? required(await tx.get("tasks", input.taskId)) : null;
          if (input.mode === "computer" && !task) {
            task = {
              ...base(conversation.scope),
              title: text(input.prompt).slice(0, 120),
              goal: text(input.prompt),
              currentRoundId: "",
              goalVersion: 0,
              requestedByUserId: input.actorId,
              status: "open",
              conversationId: conversation.id,
              currentRevisionId: null,
              acceptedRevisionId: null,
              idempotencyKey: `turn:${input.idempotencyKey}`,
            };
            await tx.save("tasks", task);
            await roundIn(tx, task, {
              ...input,
              goal: input.prompt,
              attachmentIds: input.attachmentIds ?? [],
            });
          }
          if (input.mode === "search" && task)
            fail("CLOUD_INVALID_INPUT", "Search cannot target a task.");
          const turn = {
            ...base(conversation.scope),
            conversationId: conversation.id,
            actorId: input.actorId,
            prompt: text(input.prompt),
            mode: input.mode,
            runId: "",
            attachmentIds: input.attachmentIds ?? [],
            idempotencyKey: input.idempotencyKey,
          };
          const run = await queue(tx, {
            actorId: input.actorId,
            conversationId: conversation.id,
            turnId: turn.id,
            taskId: task?.id ?? null,
            mode: input.mode,
            prompt: turn.prompt,
            attachmentIds: turn.attachmentIds,
            scope: conversation.scope,
            ...(input.roundId ? { roundId: input.roundId } : {}),
            ...(input.goalVersion !== undefined ? { goalVersion: input.goalVersion } : {}),
          });
          turn.runId = run.id;
          await tx.save("turns", turn);
          conversation.updatedAt = now();
          await tx.save("conversations", conversation);
          return { turn, run, task: task ? await tx.get("tasks", task.id) : null };
        },
      );
    },
  };
}
