import { expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  computers,
  agents,
  spaceMembers,
  routines,
  routineIdentities,
  routineSecrets,
  routineOccurrences,
  routineDeliveries,
  routineEvents,
  spaceMemoryDocuments,
  spaceMemoryRevisions,
  conversationRunMemoryPins,
  conversationEvents,
  conversationRuns,
  approvalSettings,
  approvalRules,
  approvalRequests,
  conversationEffects,
  conversationRunAttempts,
  conversationRunCheckpoints,
  conversationRunSteering,
  conversationRunBackupJobs,
  conversationToolCalls,
  modelConnections,
  modelConnectionSecrets,
  modelConnectionSpaces,
  spaceAudit,
  spaceDeletionJobs,
  spaceEvents,
  spaceInvitations,
  spaceSettingsOverrides,
  schema,
  user,
} from "./schema.js";

it("keeps membership history and new Space references scoped and removable", () => {
  for (const table of [
    spaceAudit,
    spaceDeletionJobs,
    spaceEvents,
    spaceInvitations,
    spaceSettingsOverrides,
  ]) {
    const config = getTableConfig(table);
    expect(config.columns[0]?.name).toBe("space_id");
    for (const key of config.foreignKeys) {
      expect(key.reference().columns[0]?.name).toBe("space_id");
      expect(key.onDelete).toBe("cascade");
    }
  }
  expect(getTableConfig(spaceMembers).columns.map((column) => column.name)).toContain("removed_at");
  expect(spaceEvents.subjectAccountId.generated).toBeDefined();
  const invitations = getTableConfig(spaceInvitations);
  expect(
    invitations.foreignKeys.map((key) => key.reference().columns.map((column) => column.name)),
  ).toEqual(
    expect.arrayContaining([
      ["space_id", "inviter_account_id"],
      ["space_id", "consumed_by_account_id"],
    ]),
  );
  expect(getTableConfig(spaceAudit).foreignKeys).toHaveLength(1);
  expect(getTableConfig(spaceAudit).columns.map((column) => column.name)).not.toEqual(
    expect.arrayContaining(["token", "email", "arguments", "content"]),
  );
});

it("uses the public schema with Better Auth Admin fields", () => {
  expect(Object.keys(schema)).toEqual(
    expect.arrayContaining([
      "user",
      "session",
      "account",
      "verification",
      "controlDevice",
      "controlTask",
      "controlRequest",
    ]),
  );
  const config = getTableConfig(user);
  expect(config.schema).toBeUndefined();
  expect(config.columns.map((c) => c.name)).toContain("name");
  expect(config.columns.map((c) => c.name)).toEqual(
    expect.arrayContaining(["role", "banned", "ban_reason", "ban_expires"]),
  );
});
it("keeps durable execution records within their Space and cascades every owned reference", () => {
  for (const table of [
    conversationRunAttempts,
    conversationRunCheckpoints,
    conversationRunSteering,
    conversationRunBackupJobs,
    conversationToolCalls,
  ]) {
    const config = getTableConfig(table);
    expect(config.primaryKeys[0]?.columns[0]?.name).toBe("space_id");
    for (const key of config.foreignKeys) {
      const reference = key.reference();
      expect(reference.columns[0]?.name).toBe("space_id");
      expect(reference.foreignColumns[0]?.name).toBe("space_id");
      expect(key.onDelete).toBe("cascade");
    }
  }
  expect(getTableConfig(conversationRuns).columns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      "lease_owner",
      "lease_expires_at",
      "fence",
      "connection_id",
      "computer_id",
      "computer_generation",
      "attempt_count",
      "next_attempt_at",
    ]),
  );
  expect(
    getTableConfig(conversationEvents).foreignKeys.find((key) =>
      key.reference().columns.some((column) => column.name === "computer_id"),
    )?.onDelete,
  ).toBe("cascade");
});

it("cascades member connection, secret and selection ownership without retaining credentials in records", () => {
  for (const table of [modelConnections, modelConnectionSecrets, modelConnectionSpaces]) {
    const config = getTableConfig(table);
    expect(config.foreignKeys.length).toBeGreaterThan(0);
    for (const key of config.foreignKeys) expect(key.onDelete).toBe("cascade");
  }
  expect(getTableConfig(modelConnections).columns.map((column) => column.name)).not.toContain(
    "ciphertext",
  );
  expect(getTableConfig(modelConnectionSecrets).columns.map((column) => column.name)).toEqual(
    expect.arrayContaining(["ciphertext", "wrapped_data_key", "key_id"]),
  );
  expect(getTableConfig(approvalSettings).columns.map((column) => column.name)).toContain(
    "revision",
  );
});

it("keeps Computer references fenced by the same Space in the database metadata", () => {
  for (const table of [computers, conversationEvents]) {
    const foreignKeys = getTableConfig(table).foreignKeys.map((key) => key.reference());
    for (const reference of foreignKeys.filter((key) =>
      key.columns.some((column) =>
        ["agent_id", "created_by_account_id", "computer_id"].includes(column.name),
      ),
    )) {
      expect(reference.columns[0]?.name).toBe("space_id");
      expect(reference.foreignColumns[0]?.name).toBe("space_id");
      expect(reference.columns).toHaveLength(2);
    }
  }
  const indexes = getTableConfig(computers).indexes;
  expect(
    indexes.some(
      (index) =>
        index.config.name === "computers_team_idx" &&
        index.config.unique &&
        index.config.where !== undefined,
    ),
  ).toBe(true);
});

it("keeps approval settings and exact rules account-owned", () => {
  for (const table of [approvalSettings, approvalRules]) {
    const config = getTableConfig(table);
    expect(config.columns.some((column) => column.name === "space_id")).toBe(false);
    expect(
      config.foreignKeys.map((key) => key.reference().columns.map((column) => column.name)),
    ).toContainEqual(["account_id"]);
  }
  const rules = getTableConfig(approvalRules);
  const action = rules.uniqueConstraints.find(
    (constraint) => constraint.name === "approval_rules_action_idx",
  );
  expect(action?.columns.map((column) => column.name)).toEqual([
    "account_id",
    "tool_name",
    "executable",
  ]);
  expect(action?.nullsNotDistinct).toBe(true);
});

it("includes the Space in every approval/effect and card reference", () => {
  for (const table of [approvalRequests, conversationEffects]) {
    const config = getTableConfig(table);
    expect(config.primaryKeys[0]?.columns[0]?.name).toBe("space_id");
    for (const key of config.foreignKeys) {
      const reference = key.reference();
      expect(reference.columns[0]?.name).toBe("space_id");
      expect(reference.foreignColumns[0]?.name).toBe("space_id");
    }
    expect(
      config.foreignKeys.some(
        (key) =>
          key
            .reference()
            .columns.map((column) => column.name)
            .join() === "space_id,conversation_id,run_id",
      ),
    ).toBe(true);
  }
  const card = getTableConfig(conversationEvents).foreignKeys.find((key) =>
    key.reference().columns.some((column) => column.name === "request_id"),
  );
  expect(card?.reference().foreignTable).toBe(approvalRequests);
  expect(card?.reference().columns.map((column) => column.name)).toEqual([
    "space_id",
    "conversation_id",
    "run_id",
    "request_id",
  ]);
  expect(card?.reference().foreignColumns.map((column) => column.name)).toEqual([
    "space_id",
    "conversation_id",
    "run_id",
    "id",
  ]);
  expect(card?.onDelete).toBe("cascade");
  const active = getTableConfig(conversationRuns).indexes.find(
    (index) => index.config.name === "conversation_runs_active_agent_idx",
  );
  expect(active?.config.unique).toBe(true);
  expect(active?.config.where).toBeDefined();
});
it("cascades approval ownership and retains Run actor identity after membership removal", () => {
  for (const table of [approvalSettings, approvalRules, approvalRequests, conversationEffects])
    for (const key of getTableConfig(table).foreignKeys) expect(key.onDelete).toBe("cascade");
  const actor = getTableConfig(conversationRuns).foreignKeys.find((key) =>
    key.reference().columns.some((column) => column.name === "member_account_id"),
  );
  expect(actor).toBeUndefined();
});

it("requires actual Space columns on every relational reference to a Space-owned table", () => {
  for (const table of Object.values(schema)) {
    for (const key of getTableConfig(table).foreignKeys) {
      const reference = key.reference();
      const target = getTableConfig(reference.foreignTable);
      if (!target.columns.some((column) => column.name === "space_id")) continue;
      expect(reference.columns[0]?.name).toBe("space_id");
      expect(reference.foreignColumns[0]?.name).toBe("space_id");
      expect(reference.columns.length).toBeGreaterThan(1);
    }
  }
});

it("retains the required phase-four reference targets and their deletion actions", () => {
  const cases = [
    [routines, routineIdentities, ["space_id", "id"]],
    [routines, agents, ["space_id", "agent_id"]],
    [routines, spaceMembers, ["space_id", "owner_account_id"]],
    [routineSecrets, spaceMembers, ["space_id", "account_id"]],
    [routineSecrets, routines, ["space_id", "routine_id"]],
    [routineOccurrences, routines, ["space_id", "routine_id"]],
    [routineOccurrences, conversationRuns, ["space_id", "conversation_id", "run_id"]],
    [routineDeliveries, routineOccurrences, ["space_id", "routine_id", "occurrence_id"]],
    [
      routineEvents,
      routineOccurrences,
      ["space_id", "routine_id", "occurrence_id", "conversation_id", "run_id"],
    ],
    [routineEvents, conversationRuns, ["space_id", "conversation_id", "run_id"]],
    [spaceMemoryDocuments, agents, ["space_id", "agent_id"]],
    [spaceMemoryRevisions, spaceMemoryDocuments, ["space_id", "document_id"]],
    [conversationRuns, routineIdentities, ["space_id", "routine_id"]],
    [conversationRuns, routineIdentities, ["space_id", "inbound_routine_id"]],
    [
      conversationRunMemoryPins,
      conversationRunCheckpoints,
      ["space_id", "conversation_id", "run_id"],
    ],
    [conversationRunMemoryPins, spaceMemoryRevisions, ["space_id", "document_id", "revision"]],
    [
      approvalRequests,
      conversationRuns,
      ["space_id", "conversation_id", "run_id", "member_account_id"],
    ],
    [
      approvalRequests,
      conversationRuns,
      ["space_id", "conversation_id", "run_id", "answered_by_account_id"],
    ],
  ] as const;
  for (const [table, target, columns] of cases) {
    const key = getTableConfig(table).foreignKeys.find(
      (candidate) =>
        candidate
          .reference()
          .columns.map((column) => column.name)
          .join() === columns.join(),
    );
    expect(key?.reference().foreignTable).toBe(target);
    expect(key?.onDelete).toBe("cascade");
  }
  expect(conversationRuns.inboundRoutineId.generated).toBeDefined();
});
