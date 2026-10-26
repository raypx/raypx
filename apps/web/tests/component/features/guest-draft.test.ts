/** @vitest-environment jsdom */
import { beforeEach, expect, it, vi } from "vite-plus/test";
import {
  saveGuestDraft,
  readGuestDraft,
  writeGuestDraft,
  claimGuestDraft,
  guestReturnTo,
} from "../../../src/features/tasks/guest-draft";
beforeEach(() => sessionStorage.clear());
const draft = { prompt: "Local 中😀", provider: "codex", mode: "plan" } as const;
it("keeps content out of URLs, preserves choices and scopes handoff to a server", () => {
  const target = saveGuestDraft("api-one", draft, "/tasks?from=guest");
  const id = new URL(target, "https://example.test").searchParams.get("guestDraft")!;
  expect(target).not.toContain(draft.prompt);
  const raw = sessionStorage.getItem(JSON.stringify(["raypx.guest-task.v1", "api-one"]));
  expect(readGuestDraft(raw, id)).toEqual(draft);
  expect(guestReturnTo("api-one", "/tasks")).toContain(id);
  expect(guestReturnTo("api-two", "/tasks")).toBe("/tasks");
  claimGuestDraft("api-one", "account-one");
  const owned = JSON.parse(
    sessionStorage.getItem(JSON.stringify(["raypx.guest-task.v1", "api-one", "account-one"]))!,
  );
  expect(owned.accountId).toBe("account-one");
  claimGuestDraft("api-one", "account-two");
  expect(
    JSON.parse(
      sessionStorage.getItem(JSON.stringify(["raypx.guest-task.v1", "api-one", "account-one"]))!,
    ).accountId,
  ).toBe("account-one");
  writeGuestDraft("api-one", { ...draft, prompt: "Another account" }, "/tasks");
  claimGuestDraft("api-one", "account-two");
  expect(readGuestDraft(JSON.stringify(owned), id)).toEqual(draft);
  expect(
    JSON.parse(
      sessionStorage.getItem(JSON.stringify(["raypx.guest-task.v1", "api-one", "account-two"]))!,
    ).prompt,
  ).toBe("Another account");
  expect(
    sessionStorage.getItem(JSON.stringify(["raypx.guest-task.v1", "api-one", "account-one"])),
  ).toBe(JSON.stringify(owned));
});
it("rejects mismatched, expired and malformed handoffs", () => {
  const id = crypto.randomUUID();
  const value = { ...draft, id, createdAt: 100000 };
  expect(() => readGuestDraft(JSON.stringify(value), crypto.randomUUID(), 100000)).toThrow(
    /Invalid|Draft/,
  );
  expect(() => readGuestDraft(JSON.stringify(value), id, 100000 + 86400_001)).toThrow(
    /Invalid|Draft/,
  );
  expect(() =>
    readGuestDraft(JSON.stringify({ ...value, prompt: "x".repeat(32001) }), id, 100000),
  ).toThrow(/Invalid|Draft/);
  expect(() => readGuestDraft("null", id)).toThrow(/Invalid|Draft/);
});
it("surfaces storage denial before navigation can lose the editor", () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  try {
    expect(() => saveGuestDraft("api", draft, "/tasks")).toThrow("denied");
  } finally {
    spy.mockRestore();
  }
});
it("removes an anonymous editor when its text is cleared", () => {
  writeGuestDraft("api", draft, "/tasks");
  writeGuestDraft("api", { ...draft, prompt: "" }, "/tasks");
  expect(guestReturnTo("api", "/tasks")).toBe("/tasks");
});
