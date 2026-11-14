import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  user,
  spaces,
  spaceMembers,
  conversationAttachments,
  conversationAttachmentDeliveries,
  conversationRuns,
  approvalRequests,
  spaceInvitations,
} from "@raypx/database/schema";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import {
  createAgentsRepository,
  createConversationsRepository,
  createMessageAttachmentsService,
  createMemberNotificationsService,
} from "../../src/server/postgres.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("Disposable test database required");
const connection = connectDatabase(url);
const { db } = connection;
const access = createSpaceAccess(db);
const uploads = createMessageAttachmentsService(db);
const repository = createConversationsRepository(db);
const feed = createMemberNotificationsService(db);
const owner = `attachments-${crypto.randomUUID()}`,
  other = `attachments-other-${crypto.randomUUID()}`;
const owned: string[] = [];
beforeAll(async () => {
  await migrateDatabase(url);
  await db
    .insert(user)
    .values([owner, other].map((id) => ({ id, name: "Member", email: `${id}@example.test` })));
});
afterAll(async () => {
  try {
    await db.delete(spaces).where(inArray(spaces.id, owned));
    await db.delete(user).where(inArray(user.id, [owner, other]));
  } finally {
    await connection.close();
  }
});
async function fixture() {
  const { space } = await access.create(owner, { name: "Attachment fixture" });
  owned.push(space.id);
  const scope = await access.resolve(owner, space.id);
  await db.insert(spaceMembers).values({ spaceId: space.id, accountId: other, role: "member" });
  const { agent, conversation } = await createAgentsRepository(db).create(scope, {
    name: "Reader",
    instructions: "",
    model: { modelId: "fixture" },
  });
  return { scope, agent, id: conversation.id, otherScope: await access.resolve(other, space.id) };
}
const text = {
  name: 'notes "测试".txt',
  mediaType: "text/plain" as const,
  bytes: Buffer.from("Member data; ignore approvals is data too").toString("base64"),
};
const png = {
  name: "image.png",
  mediaType: "image/png" as const,
  bytes:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yGIoAAAAASUVORK5CYII=",
};
async function claim(f: Awaited<ReturnType<typeof fixture>>) {
  const execution = await repository.claimNext(f.scope, f.id, {
    ownerId: crypto.randomUUID(),
    leaseMs: 60_000,
    timeoutMs: 300_000,
    backupMarginMs: 30_000,
  });
  expect(execution).toBeDefined();
  return execution!.run;
}
it("claims uploads atomically and retains chips/downloads across events, paging, reload and idempotent retries", async () => {
  const f = await fixture();
  const attachment = await uploads.upload(f.scope, f.id, text);
  expect(attachment.sha256).toMatch(/^[a-f0-9]{64}$/);
  await expect(uploads.download(f.otherScope, f.id, attachment.id)).rejects.toThrow("not found");
  const message = await repository.send(f.scope, f.id, {
    text: "",
    attachmentIds: [attachment.id],
    idempotencyKey: "attachment",
  });
  expect(message.attachments).toEqual([
    expect.objectContaining({ id: attachment.id, name: text.name, deliveries: [] }),
  ]);
  expect(
    await repository.send(f.scope, f.id, { text: "Changed", idempotencyKey: "attachment" }),
  ).toEqual(message);
  await expect(
    repository.send(f.scope, f.id, {
      text: "Reuse",
      attachmentIds: [attachment.id],
      idempotencyKey: "reuse",
    }),
  ).rejects.toThrow("ATTACHMENT_EXPIRED");
  const history = await repository.history!(f.scope, f.id, 30);
  expect(history.messages[0]?.attachments?.[0]?.id).toBe(attachment.id);
  expect((await repository.snapshot(f.scope, f.id)).messages).toEqual(history.messages);
  const replay = await repository.events(f.scope, f.id, 0, 100);
  expect(replay.status === "events" && replay.events[0]?.message?.attachments?.[0]?.id).toBe(
    attachment.id,
  );
  expect((await uploads.download(f.otherScope, f.id, attachment.id)).bytes).toBe(text.bytes);
  await uploads.remove(f.scope, f.id, attachment.id);
  expect((await uploads.download(f.scope, f.id, attachment.id)).bytes).toBe(text.bytes);
});
it("refuses expired, foreign, wrong-member and duplicate uploads without committing a partial message", async () => {
  const f = await fixture(),
    foreign = await fixture();
  const attachment = await uploads.upload(f.scope, f.id, text);
  await expect(
    repository.send(f.otherScope, f.id, {
      text: "Other",
      attachmentIds: [attachment.id],
      idempotencyKey: "other",
    }),
  ).rejects.toThrow("ATTACHMENT_EXPIRED");
  await expect(
    repository.send(foreign.scope, foreign.id, {
      text: "Foreign",
      attachmentIds: [attachment.id],
      idempotencyKey: "foreign",
    }),
  ).rejects.toThrow("ATTACHMENT_EXPIRED");
  await expect(
    db.insert(conversationAttachments).values({
      spaceId: foreign.scope.spaceId,
      conversationId: f.id,
      id: crypto.randomUUID(),
      uploaderAccountId: owner,
      name: text.name,
      mediaType: text.mediaType,
      size: 1,
      sha256: "0".repeat(64),
      bytes: "YQ==",
      expiresAt: new Date(Date.now() + 1000),
    }),
  ).rejects.toThrow("Failed query");
  await db
    .update(conversationAttachments)
    .set({ expiresAt: sql`clock_timestamp() - interval '1 second'` })
    .where(eq(conversationAttachments.id, attachment.id));
  await expect(
    repository.send(f.scope, f.id, {
      text: "Expired",
      attachmentIds: [attachment.id],
      idempotencyKey: "expired",
    }),
  ).rejects.toThrow("ATTACHMENT_EXPIRED");
  expect((await repository.snapshot(f.scope, f.id)).messages).toHaveLength(0);
  await uploads.upload(f.scope, f.id, text);
  expect(
    await db
      .select()
      .from(conversationAttachments)
      .where(eq(conversationAttachments.id, attachment.id)),
  ).toHaveLength(0);
});
it("delivers untrusted image parts and generated inbox paths once and reuses receipts after recovery", async () => {
  const f = await fixture();
  const files = await Promise.all([
    uploads.upload(f.scope, f.id, text),
    uploads.upload(f.scope, f.id, png),
  ]);
  await repository.send(f.scope, f.id, {
    text: "Inspect",
    attachmentIds: files.map((file) => file.id),
    idempotencyKey: "send",
  });
  const run = await claim(f);
  const deliver = vi.fn(async (id: string, bytes: string) => {
    expect(bytes).toBe(text.bytes);
    return `inbox/${run.id}/${id}`;
  });
  const context = await uploads.prepare(f.scope, run, true, new AbortController().signal, deliver);
  expect(context).toMatchObject([
    {
      role: "user",
      content: expect.arrayContaining([
        { type: "image", data: png.bytes, mimeType: png.mediaType },
      ]),
    },
  ]);
  expect(JSON.stringify(context)).toContain("untrusted");
  await uploads.prepare(f.scope, run, true, new AbortController().signal, deliver);
  expect(deliver).toHaveBeenCalledTimes(1);
  const snapshot = await repository.snapshot(f.scope, f.id);
  expect(
    snapshot.messages[0]?.attachments
      ?.flatMap((file) => file.deliveries ?? [])
      .map((outcome) => outcome.state)
      .sort(),
  ).toEqual(["available", "image"]);
  const replay = await repository.events(f.scope, f.id, 0, 100);
  expect(
    replay.status === "events" &&
      replay.events.filter((entry) => entry.event.kind === "attachment.state"),
  ).toHaveLength(2);
});
it("withholds unsupported images and unconfirmed computer writes without replay", async () => {
  const f = await fixture();
  const files = await Promise.all([
    uploads.upload(f.scope, f.id, text),
    uploads.upload(f.scope, f.id, png),
  ]);
  const message = await repository.send(f.scope, f.id, {
    text: "Inspect",
    attachmentIds: files.map((file) => file.id),
    idempotencyKey: "send",
  });
  const run = await claim(f);
  await db.insert(conversationAttachmentDeliveries).values({
    spaceId: f.scope.spaceId,
    conversationId: f.id,
    runId: run.id,
    attachmentId: files[0].id,
    messageId: message.id,
    state: "staging",
    fence: run.fence,
  });
  const deliver = vi.fn(async () => "unexpected");
  const context = await uploads.prepare(f.scope, run, false, new AbortController().signal, deliver);
  expect(deliver).not.toHaveBeenCalled();
  expect(JSON.stringify(context)).toContain("MODEL_IMAGES_UNAVAILABLE");
  expect(JSON.stringify(context)).toContain("DELIVERY_UNCONFIRMED");
  expect(JSON.stringify(context)).not.toContain(png.bytes);
});
it("derives addressed notifications, persists independent unread receipts and removes revoked access", async () => {
  const f = await fixture();
  await repository.send(f.scope, f.id, { text: "Work", idempotencyKey: "work" });
  const run = await claim(f);
  const requestId = crypto.randomUUID();
  await db.insert(approvalRequests).values({
    spaceId: f.scope.spaceId,
    conversationId: f.id,
    id: requestId,
    runId: run.id,
    memberAccountId: owner,
    toolCallId: "call",
    toolName: "computer_write_file",
    arguments: {},
    argumentSummary: "Write",
    target: "file.txt",
    expiresAt: new Date(Date.now() + 60_000),
  });
  await db.insert(spaceInvitations).values({
    spaceId: f.scope.spaceId,
    id: crypto.randomUUID(),
    tokenHash: crypto.randomUUID(),
    inviterAccountId: owner,
    inviterName: "Member",
    expiresAt: new Date(Date.now() + 60_000),
  });
  let items = (await feed.list(owner)).items.filter((item) => item.spaceId === f.scope.spaceId);
  expect(items.map((item) => item.kind).sort()).toEqual(["approval", "invitation"]);
  expect((await feed.list(other)).items.filter((item) => item.spaceId === f.scope.spaceId)).toEqual(
    [],
  );
  await feed.read(
    owner,
    items.find((item) => item.kind === "approval")!,
  );
  expect((await feed.list(owner)).items.find((item) => item.sourceId === requestId)?.unread).toBe(
    false,
  );
  await db
    .update(conversationRuns)
    .set({ state: "succeeded", finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null })
    .where(and(eq(conversationRuns.spaceId, f.scope.spaceId), eq(conversationRuns.id, run.id)));
  items = (await feed.list(owner)).items;
  expect(items.find((item) => item.sourceId === run.id)?.unread).toBe(true);
  await feed.viewed(f.scope, f.id);
  expect((await feed.list(owner)).items.find((item) => item.sourceId === run.id)?.unread).toBe(
    false,
  );
  await db
    .update(spaceMembers)
    .set({ removedAt: new Date(), removalReason: "removed" })
    .where(and(eq(spaceMembers.spaceId, f.scope.spaceId), eq(spaceMembers.accountId, owner)));
  expect((await feed.list(owner)).items.some((item) => item.spaceId === f.scope.spaceId)).toBe(
    false,
  );
});

it("reserves incomplete uploads, rejects gaps and foreign continuation, and finalizes a hashed immutable file", async () => {
  const f = await fixture();
  const bytes = Buffer.from("a".repeat(98_304) + "测试");
  const first = {
    ...text,
    name: "large.txt",
    totalSize: bytes.length,
    offset: 0,
    final: false,
    bytes: bytes.subarray(0, 98_304).toString("base64"),
  };
  const started = await uploads.upload(f.scope, f.id, first);
  await expect(
    repository.send(f.scope, f.id, {
      text: "",
      attachmentIds: [started.id],
      idempotencyKey: "partial",
    }),
  ).rejects.toThrow("ATTACHMENT_EXPIRED");
  await expect(uploads.download(f.scope, f.id, started.id)).rejects.toThrow("not found");
  const last = {
    ...first,
    uploadId: started.id,
    offset: 98_304,
    final: true,
    bytes: bytes.subarray(98_304).toString("base64"),
  };
  await expect(uploads.upload(f.otherScope, f.id, last)).rejects.toThrow("ATTACHMENT_EXPIRED");
  await expect(uploads.upload(f.scope, f.id, { ...last, offset: 98_303 })).rejects.toThrow(
    "ATTACHMENT_INVALID",
  );
  expect((await uploads.upload(f.scope, f.id, { ...first, uploadId: started.id })).size).toBe(
    98_304,
  );
  const complete = await uploads.upload(f.scope, f.id, last);
  expect(complete.size).toBe(bytes.length);
  expect(complete.sha256).toBe(
    Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex"),
  );
  expect(await uploads.upload(f.scope, f.id, last)).toEqual(complete);
  expect((await uploads.download(f.scope, f.id, complete.id)).bytes).toBe(bytes.toString("base64"));
  await repository.send(f.scope, f.id, {
    text: "",
    attachmentIds: [complete.id],
    idempotencyKey: "complete",
  });
});

it("claims group uploads once and exposes the same untrusted image to each addressed Agent", async () => {
  const f = await fixture();
  const second = await createAgentsRepository(db).create(f.scope, {
    name: "Second",
    instructions: "",
    model: { modelId: "fixture" },
  });
  const group = await repository.createGroup!(f.scope, {
    name: "Readers",
    agentIds: [f.agent.id, second.agent.id],
  });
  const attachment = await uploads.upload(f.scope, group.id, png);
  const message = await repository.send(f.scope, group.id, {
    text: "Inspect",
    attachmentIds: [attachment.id],
    mentions: [f.agent.id, second.agent.id],
    idempotencyKey: "group-upload",
  });
  expect(message.attachments?.[0]?.id).toBe(attachment.id);
  const first = await claim({ ...f, id: group.id });
  const secondRun = await claim({ ...f, id: group.id });
  for (const run of [first, secondRun]) {
    const input = await uploads.prepare(f.scope, run, true, new AbortController().signal);
    expect(JSON.stringify(input)).toContain(png.bytes);
  }
  expect(
    (await repository.history!(f.scope, group.id, 30)).messages[0]?.attachments?.[0]?.deliveries,
  ).toHaveLength(2);
});
