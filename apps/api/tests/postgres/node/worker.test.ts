import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { spaces, user } from "@raypx/database/schema";
import {
  createAgentsRepository,
  createConversationsRepository,
} from "@raypx/agents/server/postgres";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { getWorkerEnvironment } from "../../../src/env.js";
import { createApiLogging } from "../../../src/logging.js";
import { createWorkerRuntime } from "../../../src/runtime/worker.js";
import { modelFixture } from "../../helpers/model.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A newly created disposable *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const repository = createConversationsRepository(connection.db);
const accountId = `worker-${crypto.randomUUID()}`;
let spaceId: typeof spaces.$inferSelect.id;
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db
    .insert(user)
    .values({ id: accountId, name: "Worker fixture", email: `${accountId}@example.test` });
  spaceId = (await access.create(accountId, { name: "Worker recovery fixture" })).space.id;
});
afterAll(async () => {
  try {
    await connection.db.delete(spaces).where(eq(spaces.id, spaceId));
    await connection.db.delete(user).where(eq(user.id, accountId));
  } finally {
    await connection.close();
  }
});

it("recovers a lost direct start with the API role absent and no auth or broker configuration", async () => {
  const scope = await access.resolve(accountId, spaceId as Parameters<typeof access.resolve>[1]);
  const { conversation } = await createAgentsRepository(connection.db).create(scope, {
    name: "Worker",
    instructions: "Be helpful",
    model: { modelId: "fixture" },
  });
  // The committing request process vanished before dispatch. Only a worker is started.
  await repository.send(scope, conversation.id, { idempotencyKey: "lost-start", text: "Recover" });
  const model = modelFixture();
  const logger = createApiLogging({ environment: "test", sink: () => {} });
  const worker = await createWorkerRuntime(
    getWorkerEnvironment({
      NODE_ENV: "test",
      DATABASE_URL: url,
      DATABASE_MIGRATE_ON_START: "false",
      RUN_RECOVERY_INTERVAL_MS: "25",
    }),
    {
      connect: () => connectDatabase(url),
      logger,
      closeLogger: () => logger.close(),
      createModels: () => model.models,
    },
  );
  try {
    expect(model.calls).toHaveLength(0);
    expect((await repository.snapshot(scope, conversation.id)).runs[0]!.state).toBe("queued");
    expect((await worker.app.request("/rpc/conversations.send")).status).toBe(404);
    await worker.start();
    await expect.poll(() => model.calls.length).toBe(1);
    model.calls[0]!.complete("Recovered by worker");
    await expect
      .poll(async () => (await repository.snapshot(scope, conversation.id)).runs[0]!.state)
      .toBe("succeeded");
    expect(
      (await repository.snapshot(scope, conversation.id)).segments.map((segment) => segment.text),
    ).toEqual(["Recovered by worker"]);
  } finally {
    await worker.close();
  }
});
