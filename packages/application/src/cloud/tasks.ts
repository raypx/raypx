import { cloudPage } from "./pagination.js";
import {
  sameResourceScope,
  canProjectCapabilityV2,
  resolveProjectAccessV2,
  type CloudTask,
} from "@voidmix/core";
import { cloudConversations } from "./conversations.js";
import type { CloudContext, Actor, Intent } from "./context.js";

export function cloudTasks(context: CloudContext) {
  const { repo, now, fail, required, text, base, access, scopeFor, mutate, notify, roundIn } =
    context;
  return {
    createTask: (
      input: Actor &
        Intent & { title: string; goal: string; projectId?: string; attachmentIds?: string[] },
    ) =>
      repo.transaction([`actor:${input.actorId}`], async (tx) => {
        const scope = scopeFor(input);
        await access(tx, input.actorId, scope, true);
        return mutate(
          tx,
          input,
          scope,
          "task.create",
          { title: input.title, goal: input.goal, attachmentIds: input.attachmentIds ?? [] },
          async () => {
            const task: CloudTask = {
              ...base(scope),
              title: text(input.title),
              goal: text(input.goal),
              currentRoundId: "",
              goalVersion: 0,
              requestedByUserId: input.actorId,
              status: "open",
              conversationId: null,
              currentRevisionId: null,
              acceptedRevisionId: null,
              idempotencyKey: input.idempotencyKey,
            };
            await tx.save("tasks", task);
            await roundIn(tx, task, { ...input, attachmentIds: input.attachmentIds ?? [] });
            return task;
          },
        );
      }),
    listTasks: (input: Actor & { projectId?: string; limit?: number; cursor?: string }) =>
      repo.read(async (tx) => {
        const scope = scopeFor(input);
        await access(tx, input.actorId, scope);
        return cloudPage(tx, input, "tasks", { scope });
      }),
    getTask: (input: Actor & { taskId: string }) =>
      repo.read(async (tx) => {
        const task = required(await tx.get("tasks", input.taskId));
        await access(tx, input.actorId, task.scope);
        return {
          task,
          rounds: await tx.list("rounds", { parentId: task.id }),
          revisions: await tx.list("revisions", { parentId: task.id }),
          runs: await tx.list("runs", { parentId: task.id }),
        };
      }),
    updateTask: (
      input: Actor & Intent & { taskId: string; title?: string; status?: "cancelled" | "open" },
    ) =>
      repo.transaction([`actor:${input.actorId}`, `task:${input.taskId}`], async (tx) => {
        const task = required(await tx.get("tasks", input.taskId));
        await access(tx, input.actorId, task.scope, true);
        return mutate(
          tx,
          input,
          task.scope,
          "task.update",
          { taskId: input.taskId, title: input.title, status: input.status },
          async () => {
            if (await tx.activeTaskRun(task.id))
              fail("CLOUD_RUN_ACTIVE", "Cancel the active run before modifying the task.");
            if (input.title !== undefined) task.title = text(input.title);
            if (input.status) task.status = input.status;
            task.updatedAt = now();
            await tx.save("tasks", task);
            return task;
          },
        );
      }),
    startRound: (
      input: Actor &
        Intent & {
          taskId: string;
          expectedGoalVersion: number;
          goal: string;
          attachmentIds?: string[];
        },
    ) =>
      repo.transaction([`actor:${input.actorId}`, `task:${input.taskId}`], async (tx) => {
        const task = required(await tx.get("tasks", input.taskId));
        await access(tx, input.actorId, task.scope, true);
        return mutate(
          tx,
          input,
          task.scope,
          "round.start",
          {
            taskId: task.id,
            expectedGoalVersion: input.expectedGoalVersion,
            goal: input.goal,
            attachmentIds: input.attachmentIds ?? [],
          },
          async () => {
            if (task.goalVersion !== input.expectedGoalVersion)
              fail("CLOUD_REVISION_INVALID", "Task goal has changed.");
            if (await tx.activeTaskRun(task.id)) fail("CLOUD_RUN_ACTIVE", "Task is active.");
            const round = await roundIn(tx, task, {
              ...input,
              attachmentIds: input.attachmentIds ?? [],
            });
            return { task, round };
          },
        );
      }),
    continueRound: async (
      input: Actor &
        Intent & {
          taskId: string;
          roundId: string;
          goalVersion: number;
          conversationId: string;
          prompt: string;
          attachmentIds?: string[];
        },
    ) => {
      const result = await cloudConversations(context).sendTurn({ ...input, mode: "computer" });
      const round = required(await repo.read((tx) => tx.get("rounds", input.roundId)));
      return { ...result, round };
    },
    setSpendingGrant: (
      input: Actor & Intent & { projectId: string; userId: string; allowed: boolean },
    ) =>
      repo.transaction([`actor:${input.actorId}`, `project:${input.projectId}`], async (tx) => {
        const scope = { type: "project" as const, projectId: input.projectId };
        await access(tx, input.actorId, scope, true);
        const project = required(await tx.projectAccess(input.projectId, input.actorId));
        if (
          !canProjectCapabilityV2(
            resolveProjectAccessV2({ actorId: input.actorId, ...project }),
            "project.manage",
          )
        )
          fail("CLOUD_ACCESS_DENIED", "Project management permission required.");
        if (!(await tx.userActive(input.userId)))
          fail("CLOUD_ACCESS_DENIED", "Account unavailable.");
        return mutate(
          tx,
          input,
          scope,
          "spending.grant",
          { projectId: input.projectId, userId: input.userId, allowed: input.allowed },
          async () => {
            await tx.save("spendingGrants", {
              ...base(scope),
              id: `${input.projectId}:${input.userId}`,
              actorId: input.userId,
              grantedByUserId: input.actorId,
              allowed: input.allowed,
            });
            return { userId: input.userId, allowed: input.allowed };
          },
        );
      }),
    listSpendingGrants: (input: Actor & { projectId: string }) =>
      repo.read(async (tx) => {
        const scope = { type: "project" as const, projectId: input.projectId };
        await access(tx, input.actorId, scope);
        const project = required(await tx.projectAccess(input.projectId, input.actorId));
        if (
          !canProjectCapabilityV2(
            resolveProjectAccessV2({ actorId: input.actorId, ...project }),
            "project.manage",
          )
        )
          fail("CLOUD_ACCESS_DENIED", "Project management permission required.");
        return {
          items: (await tx.list("spendingGrants", { scope })).map((grant) => ({
            userId: grant.actorId,
            allowed: grant.allowed,
          })),
        };
      }),
    acceptRevision: (
      input: Actor &
        Intent & { taskId: string; revisionId: string; roundId: string; goalVersion: number },
    ) =>
      repo.transaction([`actor:${input.actorId}`, `task:${input.taskId}`], async (tx) => {
        const task = required(await tx.get("tasks", input.taskId));
        await access(tx, input.actorId, task.scope, true);
        return mutate(
          tx,
          input,
          task.scope,
          "revision.accept",
          {
            taskId: input.taskId,
            revisionId: input.revisionId,
            roundId: input.roundId,
            goalVersion: input.goalVersion,
          },
          async () => {
            const revision = required(await tx.get("revisions", input.revisionId));
            if (
              revision.taskId !== task.id ||
              task.currentRevisionId !== revision.id ||
              revision.roundId !== task.currentRoundId ||
              revision.goalVersion !== task.goalVersion ||
              (input.roundId !== undefined && input.roundId !== task.currentRoundId) ||
              (input.goalVersion !== undefined && input.goalVersion !== task.goalVersion) ||
              !sameResourceScope(revision.scope, task.scope)
            )
              fail("CLOUD_REVISION_INVALID", "Only the current delivery can be accepted.");
            if (task.acceptedRevisionId === revision.id && task.status === "completed") return task;
            if (await tx.activeTaskRun(task.id)) fail("CLOUD_RUN_ACTIVE", "Task is active.");
            if (task.status !== "review")
              fail("CLOUD_REVISION_INVALID", "Task is not ready for review.");
            task.acceptedRevisionId = revision.id;
            task.status = "completed";
            task.updatedAt = now();
            await tx.save("tasks", task);
            await notify(tx, task, "task.completed", null);
            return task;
          },
        );
      }),
  };
}
