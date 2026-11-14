import { expect, it } from "vitest";
import { pageIdSchema, type PageVersion } from "@raypx/core/pages";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  acceptPageVersion,
  beginPageEdit,
  OneTimePageLink,
  pageDocumentUrl,
  pageEditFailure,
  pageHasDraft,
  pageRestoreRequest,
  pageSaveRequest,
} from "./pages.js";
const page: PageVersion = {
  id: pageIdSchema.parse("page-a"),
  spaceId: spaceIdSchema.parse("space-a"),
  agentId: null,
  title: "Notes",
  kind: "document",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  body: "First",
  author: { kind: "member", accountId: "member-a", runId: null },
  reason: "created",
};
it("keeps the draft and expected version after a conflict", () => {
  const state = { ...beginPageEdit(page), draft: "My draft" };
  const failed = pageEditFailure(state, {
    code: "CONFLICT",
    data: { error: { code: "PAGE_CONFLICT" } },
  });
  expect(failed).toEqual({ ...state, conflict: true });
  expect(pageSaveRequest(failed)).toEqual({
    spaceId: page.spaceId,
    id: page.id,
    expectedVersion: 1,
    body: "My draft",
  });
});
it("refreshes clean source but keeps a dirty draft and its comparison version", () => {
  const next = { ...page, version: 2, body: "Agent edit" };
  expect(acceptPageVersion(beginPageEdit(page), next)).toEqual(beginPageEdit(next));
  const dirty = { ...beginPageEdit(page), draft: "My draft" };
  expect(acceptPageVersion(dirty, next)).toEqual({ ...dirty, newerVersion: 2 });
  expect(pageHasDraft(dirty)).toBe(true);
  expect(acceptPageVersion(dirty, { ...next, id: pageIdSchema.parse("other") })).toBe(dirty);
});
it("restores an exact version using the current CAS version", () => {
  expect(pageRestoreRequest({ ...page, version: 3 }, page)).toEqual({
    spaceId: page.spaceId,
    id: page.id,
    expectedVersion: 3,
    version: 1,
  });
  expect(() =>
    pageRestoreRequest(page, { ...page, spaceId: spaceIdSchema.parse("another") }),
  ).toThrow("PAGE_NOT_FOUND");
});
it("reveals a link only in memory and refuses a late completion after close", () => {
  const memory = new OneTimePageLink();
  const link = {
    id: "link",
    spaceId: page.spaceId,
    pageId: page.id,
    version: null,
    createdAt: page.createdAt,
    expiresAt: null,
    revokedAt: null,
    token: "private-token",
  };
  const generation = memory.begin();
  expect(memory.reveal(generation, "https://api.test/", link)).toEqual({
    url: "https://api.test/page-content/public/private-token",
    version: null,
  });
  memory.clear();
  expect(memory.read()).toBeNull();
  expect(memory.reveal(generation, "https://api.test", link)).toBeNull();
  expect(memory.read()).toBeNull();
});
it("uses the backend document route with the exact saved version", () => {
  expect(pageDocumentUrl("https://api.test/", page)).toBe(
    "https://api.test/page-content/member/space-a/page-a?version=1",
  );
});
