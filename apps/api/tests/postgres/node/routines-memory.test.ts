import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  routineIdentities,
  conversationRunMemoryPins,
  approvalRequests,
  routines,
  routineSecrets,
  routineOccurrences,
  routineDeliveries,
  routineEvents,
  spaceMemoryDocuments,
  spaceMemoryRevisions,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import {
  createAgentsRepository,
  createConversationsRepository,
  createApprovalsRepository,
} from "@raypx/agents/server/postgres";
import { createRoutinesService } from "@raypx/jobs/routines";
import { createRoutinesRepository } from "@raypx/jobs/routines/postgres";
import { createSpaceMemoryService } from "@raypx/memory/space-server";
import { createSpaceMemoryRepository } from "@raypx/memory/space-server/postgres";
import {
  applicationSecretKeyProvider,
  openStoredSecret,
  sealStoredSecret,
} from "../../../src/conversations/secrets.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("An isolated *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const now = () => new Date("2026-11-14T00:00:00.000Z");
const keys = applicationSecretKeyProvider("phase-four-disposable-test-key-value");
const scheduled = createRoutinesService(createRoutinesRepository(connection.db), {
  now,
  dispatch() {},
  secrets: {
    seal: (account, id, value) => sealStoredSecret(keys, account, id, value),
    open: (account, id, value) => openStoredSecret(keys, account, id, value),
  },
});
const memory = createSpaceMemoryService(createSpaceMemoryRepository(connection.db), { now });
const accounts: string[] = [];
const spaceIds: string[] = [];
beforeAll(() => migrateDatabase(url));
afterAll(async () => {
  try {
    for (const spaceId of spaceIds)
      await connection.db.delete(spaces).where(eq(spaces.id, spaceId));
    for (const accountId of accounts)
      await connection.db.delete(user).where(eq(user.id, accountId));
  } finally {
    await connection.close();
  }
});

it.each(["space", "membership", "account"] as const)(
  "removes %s with all phase-four records and encrypted secrets present",
  async (target) => {
    const accountId = `phase4-${crypto.randomUUID()}`;
    accounts.push(accountId);
    await connection.db
      .insert(user)
      .values({ id: accountId, name: "Fixture", email: `${accountId}@example.test` });
    const selected = await access.create(accountId, { name: "Shared fixture" });
    const spaceId = selected.space.id;
    spaceIds.push(spaceId);
    const scope = await access.resolve(accountId, spaceId);
    const { agent, conversation } = await createAgentsRepository(connection.db).create(scope, {
      name: "Fixture",
      instructions: "",
      model: { modelId: "fixture" },
    });
    const created = await scheduled.create(scope, {
      agentId: agent.id,
      name: "Fixture",
      prompt: "Saved fixture prompt",
      enabled: true,
      triggers: { webhook: true, repository: { events: ["push"] } },
    });
    await scheduled.webhook(
      created.routine.id,
      created.webhookKey!,
      "delivery",
      '{"fixture":true}',
    );
    const document = await memory.create(scope, {
      scope: "space",
      agentId: null,
      title: "Shared",
      text: "Fixture knowledge",
      pinned: true,
      attribution: { speaker: null, source: null },
    });
    const conversations = createConversationsRepository(connection.db, undefined, { now });
    const execution = (await conversations.claimNext(scope, conversation.id, {
      ownerId: "deletion-fixture",
      leaseMs: 30_000,
      timeoutMs: 300_000,
      backupMarginMs: 30_000,
    }))!;
    await conversations.saveCheckpoint(scope, execution.run, {
      ...execution.checkpoint,
      memory: {
        revisions: [{ documentId: document.id, revision: document.revision }],
        context: "Accepted fixture memory",
        untrustedInput: false,
      },
    });
    const request = await createApprovalsRepository(connection.db).createRequest(
      scope,
      execution.run,
      {
        id: "memory-save",
        name: "agent_memory_save",
        arguments: { title: "Fixture", text: "Knowledge" },
        argumentSummary: "Save memory document",
        target: "Agent memory",
        changes: true,
      },
      new Date("2099-01-01T00:00:00Z"),
      now(),
    );
    for (const table of [
      routineIdentities,
      conversationRunMemoryPins,
      approvalRequests,
      routines,
      routineSecrets,
      routineOccurrences,
      routineDeliveries,
      routineEvents,
      spaceMemoryDocuments,
      spaceMemoryRevisions,
    ]) {
      expect(
        await connection.db.select().from(table).where(eq(table.spaceId, spaceId)),
      ).not.toHaveLength(0);
    }
    if (target === "space") await connection.db.delete(spaces).where(eq(spaces.id, spaceId));
    if (target === "membership")
      await connection.db.delete(spaceMembers).where(eq(spaceMembers.accountId, accountId));
    if (target === "account") await connection.db.delete(user).where(eq(user.id, accountId));
    for (const table of [
      routines,
      routineSecrets,
      routineOccurrences,
      routineDeliveries,
      routineEvents,
    ])
      expect(await connection.db.select().from(table).where(eq(table.spaceId, spaceId))).toEqual(
        [],
      );
    const expectedHistoricalRows = target === "space" ? 0 : 1;
    expect(
      await connection.db
        .select()
        .from(routineIdentities)
        .where(eq(routineIdentities.spaceId, spaceId)),
    ).toHaveLength(expectedHistoricalRows);
    expect(
      await connection.db
        .select()
        .from(conversationRunMemoryPins)
        .where(eq(conversationRunMemoryPins.spaceId, spaceId)),
    ).toHaveLength(expectedHistoricalRows);
    if (target !== "space") await conversations.snapshot(scope, execution.run.conversationId);
    expect(
      await connection.db
        .select({ state: approvalRequests.state })
        .from(approvalRequests)
        .where(eq(approvalRequests.id, request.id)),
    ).toEqual(target === "space" ? [] : [{ state: "cancelled" }]);
    const documents = await connection.db
      .select()
      .from(spaceMemoryDocuments)
      .where(eq(spaceMemoryDocuments.spaceId, spaceId));
    const remainingDocuments = target === "space" ? 0 : 1;
    expect(documents).toHaveLength(remainingDocuments);
    expect(
      await connection.db
        .select()
        .from(spaceMemoryRevisions)
        .where(eq(spaceMemoryRevisions.spaceId, spaceId)),
    ).toHaveLength(remainingDocuments);
    expect(documents[0]?.authorAccountId ?? null).toBe(target === "membership" ? accountId : null);
    await expect(access.resolve(accountId, spaceId)).rejects.toThrow("Space record not found");
  },
);
