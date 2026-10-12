import { connectDatabase, migrateDatabase, PostgresCloudRepository } from "@voidmix/db";
import { authAccounts, users, v2Projects } from "@voidmix/db/schema";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";

export const accounts = {
  admin: { id: "e2e-admin", email: "admin@example.test", name: "E2E Administrator" },
  member: { id: "e2e-member", email: "member@example.test", name: "E2E Member" },
  pilot: { id: "e2e-pilot", email: "pilot@example.test", name: "Pilot Tester" },
} as const;
// Synthetic, test-only credentials. Never read or copy a developer account.
export const password = "Voidmix-test-login-only-2026!";
export function databaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    process.env.NODE_ENV !== "test" ||
    !/^\/voidmix_[a-z0-9_]*test$/.test(new URL(url).pathname)
  )
    throw new Error(
      "E2E requires NODE_ENV=test and TEST_DATABASE_URL pointing to a dedicated voidmix_*test database.",
    );
  return url;
}
export default async function setup() {
  const url = databaseUrl();
  await migrateDatabase(url);
  const connection = connectDatabase(url);
  try {
    await connection.db.execute(sql`truncate table users cascade`);
    const hash = await hashPassword(password);
    await connection.db.insert(users).values(
      Object.values(accounts).map((account) => ({
        id: account.id,
        email: account.email,
        displayName: account.name,
        role: account.id === accounts.admin.id ? ("owner" as const) : ("user" as const),
        emailVerified: true,
      })),
    );
    await connection.db.insert(authAccounts).values(
      Object.values(accounts).map((account) => ({
        id: `login-${account.id}`,
        accountId: account.id,
        providerId: "credential",
        userId: account.id,
        password: hash,
      })),
    );
    await connection.db.insert(users).values(
      Array.from({ length: 120 }, (_, i) => ({
        id: `e2e-person-${i.toString().padStart(3, "0")}`,
        email: `person-${i}@example.test`,
        displayName: `Directory person ${i.toString().padStart(3, "0")}`,
        status: i === 0 ? ("suspended" as const) : ("active" as const),
      })),
    );
    await connection.db.insert(v2Projects).values([
      ...Array.from({ length: 52 }, (_, i) => ({
        id: `e2e-project-${i.toString().padStart(3, "0")}`,
        title: `Admin film ${i.toString().padStart(3, "0")}`,
        createdByUserId: accounts.admin.id,
        personalOwnerId: accounts.admin.id,
      })),
      {
        id: "e2e-member-project",
        title: "Member private film",
        createdByUserId: accounts.member.id,
        personalOwnerId: accounts.member.id,
      },
    ]);
    // Recorded, synthetic cloud facts exercise the real authorized API and UI.
    // No production route supplies fixture data or pretends to execute a model.
    const repository = new PostgresCloudRepository(connection.db);
    const time = new Date("2026-10-06T00:00:00Z");
    const base = (id: string, actorId: string) => ({
      id,
      scope: { type: "personal" as const, ownerUserId: actorId },
      createdAt: time,
      updatedAt: time,
    });
    await repository.transaction(["e2e-recorded-cloud-fixtures"], async (tx) => {
      for (const [suffix, actorId, title, status] of [
        ["recorded", accounts.member.id, "Recorded research", "waiting_input"],
        ["review", accounts.member.id, "Recorded delivery", "review"],
        ["admin-private", accounts.admin.id, "Administrator private research", "waiting_input"],
      ] as const) {
        const conversationId = `e2e-cloud-${suffix}`,
          taskId = `e2e-cloud-task-${suffix}`,
          runId = `e2e-cloud-run-${suffix}`,
          executionId = `e2e-cloud-execution-${suffix}`,
          roundId = `e2e-cloud-round-${suffix}`,
          turnId = `e2e-cloud-turn-${suffix}`;
        await tx.save("conversations", {
          ...base(conversationId, actorId),
          title,
          createdByUserId: actorId,
          idempotencyKey: conversationId,
        });
        await tx.save("tasks", {
          ...base(taskId, actorId),
          title,
          goal: "Review the recorded research and its sources.",
          currentRoundId: roundId,
          goalVersion: 1,
          requestedByUserId: actorId,
          status,
          conversationId,
          currentRevisionId: suffix === "review" ? "e2e-cloud-revision-review" : null,
          acceptedRevisionId: null,
          idempotencyKey: taskId,
        });
        await tx.save("rounds", {
          ...base(roundId, actorId),
          taskId,
          goalVersion: 1,
          goal: "Review the recorded research and its sources.",
          attachmentIds: [],
          callBudget: 40,
          durationBudgetMs: 20 * 60 * 1000,
          createdByUserId: actorId,
          idempotencyKey: roundId,
        });
        const runStatus = suffix === "review" ? ("succeeded" as const) : ("needs_input" as const);
        await tx.save("runs", {
          ...base(runId, actorId),
          conversationId,
          turnId,
          taskId,
          roundId,
          ownerAccountId: `user:${actorId}`,
          requestedByUserId: actorId,
          mode: "computer",
          prompt: "Review the recorded research.",
          attachmentIds: [],
          status: runStatus,
          attempt: 1,
          retryOfRunId: null,
          lastSequence: 4,
          ownerId: null,
          epoch: 1,
          heartbeatAt: time,
          leaseExpiresAt: null,
          startedAt: time,
          completedAt: time,
          cancelRequested: false,
          output: `${title} answer [1].`,
          error: null,
          dispatchReady: true,
        });
        await tx.save("turns", {
          ...base(turnId, actorId),
          conversationId,
          actorId,
          prompt: "Review the recorded research.",
          mode: "computer",
          runId,
          attachmentIds: [],
          idempotencyKey: turnId,
        });
        await tx.save("executions", {
          ...base(executionId, actorId),
          runId,
          parentId: null,
          role: "main",
          prompt: "Review recorded sources",
          status: runStatus,
          output: `${title} answer [1].`,
          depth: 0,
        });
        const callId = `e2e-cloud-tool-${suffix}`;
        await tx.save("tools", {
          ...base(callId, actorId),
          runId,
          executionId,
          name: "read_source",
          input: { source: "recorded" },
          output: { summary: "Recorded tool detail" },
          status: "succeeded",
        });
        await tx.save("sources", {
          ...base(`e2e-source-${suffix}`, actorId),
          runId,
          url: "https://example.com/recorded-source",
          title: "Recorded source",
          excerpt: "Synthetic source stored by the browser test setup.",
        });
        for (const [sequence, type, payload] of [
          [1, "tool.started", { callId, name: "read_source", input: { source: "recorded" } }],
          [
            2,
            "tool.completed",
            { callId, name: "read_source", output: { summary: "Recorded tool detail" } },
          ],
          [3, "message.completed", { messageId: executionId, text: `${title} answer [1].` }],
          [4, "run.status", { status: runStatus, output: `${title} answer [1].` }],
        ] as const)
          await tx.appendEvent({
            runId,
            sequence,
            type,
            executionId,
            payload: { ...payload },
            occurredAt: time,
            eventId: `${runId}:${sequence}`,
          });
        await tx.save("messages", {
          ...base(`${runId}:${executionId}`, actorId),
          runId,
          messageId: executionId,
          executionId,
          text: `${title} answer [1].`,
          completed: true,
          sequence: 3,
        });
        await tx.save("notifications", {
          ...base(`e2e-notification-${suffix}`, actorId),
          recipientId: actorId,
          taskId,
          conversationId,
          runId,
          type: suffix === "review" ? "task.review" : "task.waiting_input",
          readAt: null,
          emailEnabled: false,
          emailDeliveredAt: null,
        });
      }
      const scope = base("e2e-review-report", accounts.member.id);
      await tx.save("assets", {
        ...scope,
        requestedByUserId: accounts.member.id,
        ownerAccountId: `user:${accounts.member.id}`,
        name: "recorded-report.md",
        objectKey: "recorded/offline-report",
        mediaType: "text/markdown",
        byteSize: 18,
        checksum: "0".repeat(64),
        published: true,
        verifiedAt: time,
        uploadId: "recorded-upload",
        idempotencyKey: "recorded-upload",
        runId: "e2e-cloud-run-review",
        expiresAt: time,
      });
      await tx.save("revisions", {
        ...base("e2e-cloud-revision-review", accounts.member.id),
        taskId: "e2e-cloud-task-review",
        roundId: "e2e-cloud-round-review",
        goalVersion: 1,
        runId: "e2e-cloud-run-review",
        assetVersionIds: [scope.id],
        summary: "Recorded report for acceptance testing.",
        revision: 1,
      });
      const historyConversationId = "e2e-history-conversation";
      await tx.save("conversations", {
        ...base(historyConversationId, accounts.pilot.id),
        title: "Historical conversation",
        createdByUserId: accounts.pilot.id,
        idempotencyKey: historyConversationId,
      });
      for (let index = 0; index < 105; index++) {
        const id = index.toString().padStart(3, "0"),
          createdAt = new Date(time.valueOf() + index);
        const turnId = `history-turn-${id}`,
          runId = `history-run-${id}`;
        const scope = { ...base(turnId, accounts.pilot.id), createdAt, updatedAt: createdAt };
        await tx.save("turns", {
          ...scope,
          conversationId: historyConversationId,
          actorId: accounts.pilot.id,
          prompt: `Historical question ${id}`,
          mode: "search",
          runId,
          attachmentIds: [],
          idempotencyKey: turnId,
        });
        await tx.save("runs", {
          ...scope,
          id: runId,
          conversationId: historyConversationId,
          turnId,
          taskId: null,
          roundId: null,
          ownerAccountId: `user:${accounts.pilot.id}`,
          requestedByUserId: accounts.pilot.id,
          mode: "search",
          prompt: `Historical question ${id}`,
          attachmentIds: [],
          status: "needs_input",
          attempt: 1,
          retryOfRunId: null,
          lastSequence: 0,
          ownerId: null,
          epoch: 0,
          heartbeatAt: time,
          leaseExpiresAt: null,
          startedAt: time,
          completedAt: time,
          cancelRequested: false,
          output: null,
          error: null,
          dispatchReady: true,
        });
      }
      for (let index = 0; index < 55; index++) {
        const id = `e2e-pagination-${index.toString().padStart(3, "0")}`,
          createdAt = new Date(time.valueOf() + index + 1000);
        await tx.save("conversations", {
          ...base(id, accounts.pilot.id),
          createdAt,
          updatedAt: createdAt,
          title: `Paged conversation ${index.toString().padStart(3, "0")}`,
          createdByUserId: accounts.pilot.id,
          idempotencyKey: id,
        });
      }
      await tx.save("usage", {
        ...base("e2e-cloud-unknown-usage", accounts.member.id),
        runId: "e2e-cloud-run-recorded",
        roundId: "e2e-cloud-round-recorded",
        executionId: "e2e-cloud-execution-recorded",
        accountId: `user:${accounts.member.id}`,
        provider: "recorded",
        model: "recorded",
        pricing: null,
        state: "unknown",
        reservedTokens: 100,
        inputTokens: null,
        outputTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        estimatedCost: null,
        settledAt: time,
      });
    });
  } finally {
    await connection.close();
  }
}
