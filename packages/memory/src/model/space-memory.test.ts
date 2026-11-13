import { describe, expect, it } from "vitest";
import { agentIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import { type SpaceMemoryRevision } from "@raypx/core/space-memory";
import { agentId, spaceId, memoryDocument } from "../../tests/helpers/space-memory.js";
import {
  beginMemoryEdit,
  groupSpaceMemory,
  memoryEditorFailure,
  memoryRestoreRequest,
  reloadMemoryEditor,
  spaceMemoryFailure,
} from "./space-memory.js";

describe("Space memory editor", () => {
  it("creates an Agent-scoped draft and preserves the current fields when editing", () => {
    expect(beginMemoryEdit(agentId).draft).toMatchObject({
      scope: "agent",
      agentId,
      title: "",
      text: "",
      pinned: false,
    });
    const document = {
      ...memoryDocument(),
      pinned: true,
      attribution: { speaker: "Member", source: "Meeting" },
    };
    expect(beginMemoryEdit(agentId, document).draft).toMatchObject({
      title: document.title,
      text: document.text,
      pinned: true,
      attribution: document.attribution,
    });
  });
  it("retains the draft on conflict and reloads only the expected revision", () => {
    const editing = beginMemoryEdit(agentId, memoryDocument());
    editing.draft.text = "Unsaved draft";
    const failed = memoryEditorFailure(editing, {
      code: "CONFLICT",
      data: { error: { code: "MEMORY_CONFLICT" } },
    });
    expect(failed.conflict).toBe(true);
    expect(failed.draft.text).toBe("Unsaved draft");
    const reloaded = reloadMemoryEditor(failed, memoryDocument(2));
    expect(reloaded.current?.revision).toBe(2);
    expect(reloaded.draft.text).toBe("Unsaved draft");
    expect(reloaded.conflict).toBe(false);
  });
  it("maps every exposed error without exposing server messages", () => {
    for (const code of [
      "MEMORY_NOT_FOUND",
      "MEMORY_CONFLICT",
      "MEMORY_SHARING_DISABLED",
      "MEMORY_LIMIT",
    ])
      expect(spaceMemoryFailure({ data: { error: { code } } })).toBe(code);
    expect(spaceMemoryFailure(new Error("private content"))).toBe("UNAVAILABLE");
  });
  it("groups only this Agent's and shared documents", () => {
    const own = memoryDocument();
    const shared = { ...own, agentId: null, scope: "space" as const };
    const other = { ...own, agentId: agentIdSchema.parse("agent-2") };
    expect(groupSpaceMemory([own, shared, other], agentId)).toEqual({
      agent: [own],
      space: [shared],
    });
  });
  it("restores an exact historical revision using the current revision guard", () => {
    const revision: SpaceMemoryRevision = { ...memoryDocument(), reason: "created" };
    expect(memoryRestoreRequest(spaceId, memoryDocument(3), revision)).toEqual({
      spaceId,
      id: revision.id,
      expectedRevision: 3,
      revision: 1,
    });
    expect(() =>
      memoryRestoreRequest(spaceIdSchema.parse("other-space"), memoryDocument(3), revision),
    ).toThrow("MEMORY_NOT_FOUND");
  });
});
