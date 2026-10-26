/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useState } from "react";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import type { TaskContextSelection } from "@raypx/core/tasks";
import type { ContextDocument, ContextVersion } from "../../src/index.js";
import {
  ContextPicker,
  ContextSnapshot,
  MemoryLibraryPage,
  type MemoryClientPort,
} from "../../src/client.js";

expect.extend(matchers);
const deviceId = "11111111-1111-4111-8111-111111111111",
  projectId = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
function document(revision = 2, name = "Project conventions"): ContextDocument {
  return {
    id,
    kind: "memory",
    name,
    category: "Engineering",
    content: `Reference revision ${revision}`,
    project: null,
    revision,
    archived: false,
    createdAt: "2026-10-26T00:00:00Z",
    updatedAt: "2026-10-26T00:00:00Z",
  };
}
function version(revision: number): ContextVersion {
  return { ...document(revision), reason: "updated" };
}
function fixture() {
  const client = {
    list: vi.fn<MemoryClientPort["list"]>(async () => [document()]),
    get: vi.fn<MemoryClientPort["get"]>(async () => document()),
    create: vi.fn<MemoryClientPort["create"]>(async (input) => ({
      ...document(),
      ...input.document,
    })),
    update: vi.fn<MemoryClientPort["update"]>(async (input) => ({
      ...document(input.revision + 1),
      ...input.document,
    })),
    archive: vi.fn<MemoryClientPort["archive"]>(async (input) => ({
      ...document(input.revision + 1),
      archived: input.archived,
    })),
    history: vi.fn<MemoryClientPort["history"]>(async () => [version(2), version(1)]),
    restore: vi.fn<MemoryClientPort["restore"]>(async (input) => document(input.revision + 1)),
    resolve: vi.fn<MemoryClientPort["resolve"]>(async () => ({
      capturedAt: "2026-10-26T00:00:00Z",
      sources: [],
    })),
  };
  return client;
}
const language = (children: React.ReactNode) => (
  <BrowserLanguageProvider>{children}</BrowserLanguageProvider>
);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  const style = window.document.createElement("style");
  style.dataset.memoryMotion = "true";
  style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
  window.document.head.append(style);
});
afterEach(() => {
  cleanup();
  window.document.querySelector("[data-memory-motion]")?.remove();
  vi.restoreAllMocks();
});

it("retains the creation intent and edited content after a lost receipt and payload conflict", async () => {
  const client = fixture();
  client.create.mockRejectedValueOnce(new Error("private failure"));
  client.create.mockRejectedValueOnce({ data: { error: { code: "IDEMPOTENCY_CONFLICT" } } });
  render(language(<MemoryLibraryPage client={client} ownerKey="account-one" scope="account" />));
  await screen.findByRole("heading", { name: "Project conventions" });
  fireEvent.click(screen.getByRole("button", { name: "New reference" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Initial reference" } });
  fireEvent.change(screen.getByLabelText("Reference content"), {
    target: { value: "Initial content" },
  });
  fireEvent.submit(screen.getByLabelText("Reference content").closest("form")!);
  await screen.findByRole("alert");
  const requestId = client.create.mock.calls[0]?.[0].requestId;
  expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  fireEvent.change(screen.getByLabelText("Reference content"), {
    target: { value: "Changed content" },
  });
  fireEvent.click(screen.getByRole("button", { name: "New reference" }));
  fireEvent.submit(screen.getByLabelText("Reference content").closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("already used with different content");
  expect(client.create.mock.calls[1]?.[0]).toMatchObject({
    requestId,
    document: { content: "Changed content" },
  });
  expect(screen.getByLabelText("Reference content")).toHaveValue("Changed content");
  expect(screen.queryByText("private failure")).toBeNull();
});

it("keeps content open after a CAS conflict and confirms archiving independently", async () => {
  const client = fixture();
  client.update.mockRejectedValue({ data: { error: { code: "CONTEXT_CONFLICT" } } });
  render(language(<MemoryLibraryPage client={client} ownerKey="device" scope="device" />));
  await screen.findByRole("heading", { name: "Project conventions" });
  fireEvent.click(screen.getByRole("button", { name: "Edit: Project conventions" }));
  const content = await screen.findByLabelText("Reference content");
  fireEvent.change(content, { target: { value: "Unsaved decisions" } });
  fireEvent.submit(content.closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("your edits are still here");
  expect(content).toHaveValue("Unsaved decisions");
  expect(client.update.mock.calls[0]?.[0]).toMatchObject({ id, revision: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Archive: Project conventions" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("Existing task snapshots and version history are preserved");
  expect(client.archive).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Archive" }));
  await waitFor(() => expect(client.archive).toHaveBeenCalledTimes(1));
  expect(client.archive.mock.calls[0]?.[0]).toEqual({ id, revision: 2, archived: true });
});

it("translates a native quota code while preserving the new reference draft", async () => {
  const client = fixture();
  client.create.mockRejectedValue(new Error("CONTEXT_LIMIT: private database diagnostic"));
  render(language(<MemoryLibraryPage client={client} ownerKey="device" scope="device" />));
  await screen.findByRole("heading", { name: "Project conventions" });
  fireEvent.click(screen.getByRole("button", { name: "New reference" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New decisions" } });
  fireEvent.change(screen.getByLabelText("Reference content"), {
    target: { value: "Unsaved reference" },
  });
  fireEvent.submit(screen.getByLabelText("Reference content").closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "100-reference limit, including archived references",
  );
  expect(screen.getByRole("alert")).toHaveTextContent("You can edit existing references");
  expect(screen.getByLabelText("Reference content")).toHaveValue("Unsaved reference");
  expect(screen.queryByText("private database diagnostic")).toBeNull();
});

it("pages the timeline and restores an old version using the viewed current revision", async () => {
  const client = fixture();
  client.list.mockResolvedValue([document(22)]);
  client.history
    .mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => version(22 - index)))
    .mockResolvedValueOnce([version(2), version(1)]);
  render(language(<MemoryLibraryPage client={client} ownerKey="account" scope="account" />));
  await screen.findByRole("heading", { name: "Project conventions" });
  fireEvent.click(screen.getByRole("button", { name: "Version timeline" }));
  fireEvent.click(await screen.findByRole("button", { name: "Load older versions" }));
  const row = await screen.findByRole("button", { name: /^Revision 1\s*Updated/ });
  expect(client.history.mock.calls[1]?.[0]).toEqual({ id, before: 3, limit: 20 });
  await userEvent.click(row);
  expect(await screen.findByText("Reference revision 1")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Restore revision 1" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("creates a new current revision");
  await userEvent.click(within(dialog).getByRole("button", { name: "Restore version" }));
  await waitFor(() => expect(client.restore).toHaveBeenCalledTimes(1));
  expect(client.restore.mock.calls[0]?.[0]).toEqual({ id, revision: 22, version: 1 });
});

it.each(["account", "client"] as const)(
  "aborts old %s reads and ignores late private references",
  async (change) => {
    const first = fixture(),
      second = fixture();
    let resolve!: (value: ContextDocument[]) => void;
    first.list.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = render(
      language(<MemoryLibraryPage client={first} ownerKey="one" scope="account" />),
    );
    await waitFor(() => expect(first.list).toHaveBeenCalledTimes(1));
    const signal = first.list.mock.calls[0]?.[1]?.signal;
    const next = change === "account" ? first : second;
    next.list.mockResolvedValue([document(2, "Current account")]);
    view.rerender(
      language(
        <MemoryLibraryPage
          client={next}
          ownerKey={change === "account" ? "two" : "one"}
          scope="account"
        />,
      ),
    );
    expect(await screen.findByRole("heading", { name: "Current account" })).toBeVisible();
    expect(signal?.aborted).toBe(true);
    resolve([document(2, "Private late reference")]);
    await waitFor(() => expect(screen.queryByText("Private late reference")).toBeNull());
  },
);

it("filters sources by project and preserves a chosen historical revision until an explicit update", async () => {
  const client = fixture();
  client.list.mockResolvedValue([
    document(),
    {
      ...document(1, "Wrong project"),
      id: crypto.randomUUID(),
      project: { deviceId, projectId: crypto.randomUUID() },
    },
    { ...document(1, "Archived reference"), id: crypto.randomUUID(), archived: true },
  ]);
  client.history.mockResolvedValue([version(1)]);
  const changed = vi.fn();
  function Picker() {
    const [value, setValue] = useState<TaskContextSelection>({ sources: [{ id, revision: 1 }] });
    return (
      <ContextPicker
        client={client}
        ownerKey="account"
        target={{ deviceId, projectId }}
        value={value}
        onChange={(selection) => {
          changed(selection);
          setValue(selection);
        }}
      />
    );
  }
  render(language(<Picker />));
  await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
  const checkbox = await screen.findByRole("checkbox", { name: /Project conventions.*Revision 1/ });
  expect(checkbox).toBeChecked();
  expect(screen.queryByText("Wrong project")).toBeNull();
  expect(screen.queryByText("Archived reference")).toBeNull();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Preview: Project conventions" }));
  expect(await screen.findByText("Reference revision 1")).toBeVisible();
  expect(client.history.mock.calls[0]?.[0]).toEqual({ id, before: 2, limit: 1 });
  expect(client.get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use revision 2" }));
  expect(changed).toHaveBeenLastCalledWith({ sources: [{ id, revision: 2 }] });
});

it("never auto-selects references and enforces the eight-source limit", async () => {
  const client = fixture(),
    sources = Array.from({ length: 9 }, (_, index) => ({
      ...document(1, `Reference ${index}`),
      id: crypto.randomUUID(),
    }));
  client.list.mockResolvedValue(sources);
  function Picker() {
    const [value, setValue] = useState<TaskContextSelection>({ sources: [] });
    return (
      <ContextPicker
        client={client}
        ownerKey="device"
        target={{ deviceId, projectId }}
        value={value}
        onChange={setValue}
      />
    );
  }
  render(language(<Picker />));
  await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
  const boxes = await screen.findAllByRole("checkbox");
  for (const box of boxes) expect(box).not.toBeChecked();
  for (const box of boxes.slice(0, 8)) await userEvent.click(box);
  expect(boxes[8]).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(boxes[8]!);
  expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(8);
  expect(client.resolve).not.toHaveBeenCalled();
});

it("renders the captured content as text without loading the current library", async () => {
  render(
    language(
      <ContextSnapshot
        snapshot={{
          capturedAt: "2026-10-26T00:00:00Z",
          sources: [
            { ...document(1), scope: "account", content: "<script>old frozen text</script>" },
          ],
        }}
      />,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: /Project conventions.*Revision 1/ }));
  expect(await screen.findByText("<script>old frozen text</script>")).toBeVisible();
  expect(window.document.querySelector("script")).toBeNull();
});
