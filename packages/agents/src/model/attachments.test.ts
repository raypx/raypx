import { expect, it, vi } from "vitest";
import { conversationIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import { AttachmentsController, type MessageAttachmentsPort } from "./attachments.js";
import { readConversationDraft, writeConversationDraft } from "./drafts.js";
const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("conversation"),
};
function fixture() {
  const port: MessageAttachmentsPort = {
    upload: vi.fn(async (input) => ({
      id: crypto.randomUUID(),
      name: input.name,
      mediaType: input.mediaType,
      size: 1,
      sha256: "0".repeat(64),
      createdAt: new Date().toISOString(),
    })),
    remove: vi.fn(async () => ({ ok: true as const })),
    download: vi.fn(),
  };
  return { port, controller: new AttachmentsController(selection, port) };
}
const file = { name: "notes.txt", mediaType: "text/plain", size: 1, read: async () => "YQ==" };
it("bounds type, size and count before reading or uploading and makes removal explicit", async () => {
  const { controller, port } = fixture();
  const read = vi.fn(file.read);
  await controller.add({ ...file, size: 1_048_577, read });
  expect(read).not.toHaveBeenCalled();
  expect(port.upload).not.toHaveBeenCalled();
  expect(controller.getSnapshot()[0]?.error).toBe("limit");
  controller.remove(controller.getSnapshot()[0]!.key);
  await controller.add({ ...file, mediaType: "text/html", read });
  expect(controller.getSnapshot()[0]?.error).toBe("invalid");
  controller.remove(controller.getSnapshot()[0]!.key);
  for (let i = 0; i < 4; i++) await controller.add(file);
  expect(await controller.add(file)).toBe(false);
  expect(port.upload).toHaveBeenCalledTimes(4);
  const first = controller.getSnapshot()[0]!;
  controller.remove(first.key);
  expect(port.remove).toHaveBeenCalledWith({ ...selection, id: first.attachment!.id });
  controller.dispose();
});
it("cleans up a removed in-flight upload without resurrecting a draft", async () => {
  const { controller, port } = fixture();
  let resolve!: () => void;
  const pending = controller.add({
    ...file,
    read: () =>
      new Promise<string>((done) => {
        resolve = () => done("YQ==");
      }),
  });
  expect(controller.getSnapshot()[0]?.state).toBe("uploading");
  controller.remove(controller.getSnapshot()[0]!.key);
  resolve();
  await pending;
  expect(controller.getSnapshot()).toEqual([]);
  expect(port.remove).toHaveBeenCalledTimes(1);
});
it("keeps only uploaded identities in uncertain receipts and never uploads on restoration", () => {
  const id = crypto.randomUUID();
  const draft = readConversationDraft(
    writeConversationDraft({
      text: "",
      pending: { text: "", idempotencyKey: "receipt", attachmentIds: [id] },
    }),
  );
  expect(draft.pending).toEqual({ text: "", idempotencyKey: "receipt", attachmentIds: [id] });
  const { controller, port } = fixture();
  expect(controller.getSnapshot()).toEqual([]);
  expect(port.upload).not.toHaveBeenCalled();
});

it("chunks large uploads below the native request budget and exposes only the completed identity", async () => {
  const { controller, port } = fixture();
  const bytes = Buffer.alloc(300_001, 97).toString("base64");
  expect(await controller.add({ ...file, size: 300_001, read: async () => bytes })).toBe(true);
  const calls = vi.mocked(port.upload).mock.calls.map(([input]) => input);
  expect(calls).toHaveLength(4);
  expect(calls.every((input) => JSON.stringify(input).length < 150_000)).toBe(true);
  expect(calls.map((input) => input.offset)).toEqual([0, 98_304, 196_608, 294_912]);
  expect(calls.map((input) => input.final)).toEqual([false, false, false, true]);
  expect(calls.slice(1).every((input) => typeof input.uploadId === "string")).toBe(true);
  expect(calls.map((input) => Buffer.from(input.bytes, "base64").toString()).join("")).toBe(
    "a".repeat(300_001),
  );
  expect(controller.ids()).toHaveLength(1);
});
