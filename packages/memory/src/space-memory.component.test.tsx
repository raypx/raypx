/** @vitest-environment happy-dom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { SpaceMemoryDocument, SpaceMemoryRevision } from "@raypx/core/space-memory";
import { SpaceMemoryPanel, type SpaceMemoryClientPort } from "./client.js";
import { language, setupMemoryClientTests } from "../tests/helpers/client.js";
import { agentId, spaceId, memoryDocument } from "../tests/helpers/space-memory.js";

setupMemoryClientTests();
function fixture(documents = [memoryDocument()]) {
  let current = documents;
  const versions: SpaceMemoryRevision[] = documents.map((document) => ({
    ...document,
    reason: "created",
  }));
  const client = {
    list: vi.fn<SpaceMemoryClientPort["list"]>(async (input) =>
      current.filter(
        (document) => document.scope === input.scope && (!document.removed || input.includeRemoved),
      ),
    ),
    get: vi.fn<SpaceMemoryClientPort["get"]>(async () => current[0]!),
    create: vi.fn<SpaceMemoryClientPort["create"]>(async (input) => {
      const document = { ...memoryDocument(), ...input.document };
      current = [document];
      versions.unshift({ ...document, reason: "created" });
      return document;
    }),
    update: vi.fn<SpaceMemoryClientPort["update"]>(async (input) => {
      const document = { ...memoryDocument(input.expectedRevision + 1), ...input.document };
      current = [document];
      versions.unshift({ ...document, reason: "edited" });
      return document;
    }),
    remove: vi.fn<SpaceMemoryClientPort["remove"]>(async () => {
      const document = { ...current[0]!, removed: true, text: null };
      current = [document];
      return document;
    }),
    history: vi.fn<SpaceMemoryClientPort["history"]>(async () => versions),
    restore: vi.fn<SpaceMemoryClientPort["restore"]>(async (input) => {
      const document = {
        ...versions.find((version) => version.revision === input.revision)!,
        revision: input.expectedRevision + 1,
      };
      current = [document];
      versions.unshift({ ...document, reason: "restored" });
      return document;
    }),
  };
  return client;
}
function show(client: SpaceMemoryClientPort) {
  return render(language(<SpaceMemoryPanel spaceId={spaceId} agentId={agentId} client={client} />));
}

it("creates a shared document with a rendered Markdown preview and restores focus", async () => {
  const client = fixture([]);
  show(client);
  const create = await screen.findByRole("button", { name: "New document" });
  await userEvent.click(create);
  const editor = await screen.findByRole("dialog", { name: "New document" });
  fireEvent.change(within(editor).getByRole("textbox", { name: "Title" }), {
    target: { value: "Shared guide" },
  });
  fireEvent.change(within(editor).getByRole("textbox", { name: "Markdown source" }), {
    target: { value: "**Read this**" },
  });
  expect(within(editor).getByText("Read this").tagName).toBe("STRONG");
  await userEvent.click(within(editor).getByRole("combobox", { name: "Scope" }));
  await userEvent.click(await screen.findByRole("option", { name: "Shared in this Space" }));
  await userEvent.click(within(editor).getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(client.create).toHaveBeenCalledWith({
      spaceId,
      document: expect.objectContaining({ scope: "space", agentId: null, text: "**Read this**" }),
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(create).toHaveFocus());
  expect(await screen.findByText("Document saved.")).toBeVisible();
});

it("keeps the draft after a conflict, reloads current revision, then saves explicitly", async () => {
  const client = fixture();
  client.update.mockRejectedValueOnce({ data: { error: { code: "MEMORY_CONFLICT" } } });
  client.get.mockResolvedValue(memoryDocument(2));
  show(client);
  await userEvent.click(await screen.findByRole("button", { name: "Edit Guide" }));
  const source = await screen.findByRole("textbox", { name: "Markdown source" });
  fireEvent.change(source, { target: { value: "My unsaved draft" } });
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(
    await screen.findByText(
      "This document changed while you were editing. Your draft is still here.",
    ),
  ).toBeVisible();
  expect(source).toHaveValue("My unsaved draft");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Reload current revision" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
  expect(source).toHaveValue("My unsaved draft");
  expect(client.update).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(client.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: 2,
        document: expect.objectContaining({ text: "My unsaved draft" }),
      }),
    ),
  );
});

it("compares a selected historical revision with current and confirms a restore", async () => {
  const document = memoryDocument(2),
    client = fixture([document]);
  client.history.mockResolvedValue([
    { ...document, reason: "edited" },
    { ...memoryDocument(), reason: "created" },
  ]);
  client.restore.mockResolvedValue({ ...memoryDocument(3), text: "Revision 1" });
  show(client);
  await userEvent.click(await screen.findByRole("button", { name: "History for Guide" }));
  const history = await screen.findByRole("dialog", { name: "Revision history" });
  await userEvent.click(within(history).getByRole("combobox", { name: "Revision" }));
  await userEvent.click(await screen.findByRole("option", { name: "Revision 1" }));
  expect(
    within(within(history).getByRole("region", { name: "This revision" })).getAllByText(
      "Revision 1",
    )[0],
  ).toBeVisible();
  expect(
    within(within(history).getByRole("region", { name: "Current" })).getAllByText("Revision 2")
      .length,
  ).toBeGreaterThan(0);
  await userEvent.click(within(history).getByRole("button", { name: "Restore revision 1" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Restore revision 1?" });
  await userEvent.click(within(confirm).getByRole("button", { name: "Restore revision" }));
  await waitFor(() =>
    expect(client.restore).toHaveBeenCalledWith({
      spaceId,
      id: document.id,
      expectedRevision: 2,
      revision: 1,
    }),
  );
  expect(await screen.findByText("Revision restored.")).toBeVisible();
});

it.each([
  [
    "MEMORY_SHARING_DISABLED",
    "Shared memory is disabled for this Agent. Choose This Agent or ask a member to enable sharing.",
  ],
  ["MEMORY_LIMIT", "The memory limit has been reached. Remove a document before creating another."],
])("shows run provenance and %s without losing source", async (code, message) => {
  const document: SpaceMemoryDocument = {
    ...memoryDocument(),
    pinned: true,
    provenance: { kind: "run", accountId: "member", runId: "run-1", untrustedInput: true },
  };
  const client = fixture([document]);
  client.update.mockRejectedValue({ data: { error: { code } } });
  show(client);
  expect(await screen.findByText("Saved during a Run with untrusted input")).toBeVisible();
  expect(screen.getByText("Pinned")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Edit Guide" }));
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText(message)).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Markdown source" })).toHaveValue("Revision 1");
});

it("removes a document only after confirmation", async () => {
  const client = fixture();
  show(client);
  await userEvent.click(await screen.findByRole("button", { name: "Remove Guide" }));
  const confirmation = await screen.findByRole("alertdialog", { name: "Remove Guide?" });
  expect(client.remove).not.toHaveBeenCalled();
  await userEvent.click(within(confirmation).getByRole("button", { name: "Remove document" }));
  await waitFor(() =>
    expect(client.remove).toHaveBeenCalledWith({
      spaceId,
      id: memoryDocument().id,
      expectedRevision: 1,
    }),
  );
  expect(await screen.findByText("Document removed.")).toBeVisible();
});

it("renders the complete memory flow in Chinese", async () => {
  localStorage.setItem("raypx_locale", "zh");
  show(fixture([]));
  await userEvent.click(await screen.findByRole("button", { name: "新建文档" }));
  expect(await screen.findByRole("dialog", { name: "新建文档" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Markdown 源码" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "取消" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
