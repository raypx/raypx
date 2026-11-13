import { expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  computers,
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
  schema,
  user,
} from "./schema.js";

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
  const card = getTableConfig(conversationEvents)
    .foreignKeys.find((key) =>
      key.reference().columns.some((column) => column.name === "request_id"),
    )
    ?.reference();
  expect(card?.columns.map((column) => column.name)).toEqual([
    "space_id",
    "conversation_id",
    "request_id",
  ]);
  expect(card?.foreignColumns.map((column) => column.name)).toEqual([
    "space_id",
    "conversation_id",
    "id",
  ]);
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
  expect(actor?.reference().columns.map((column) => column.name)).toEqual(["member_account_id"]);
  expect(actor?.reference().foreignTable).toBe(user);
  expect(actor?.onDelete).toBe("no action");
});
