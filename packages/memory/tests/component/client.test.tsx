/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useState } from "react";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { taskExecutionBudget, type TaskContextSelection } from "@raypx/core/tasks";
import type { ContextDocument, ContextVersion } from "../../src/index.js";
import {
  ContextPicker,
  ContextBudget,
  ContextSnapshot,
  MemoryLibraryPage,
  type MemoryClientPort,
  type MemoryUsagePort,
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const client = {
    list: vi.fn<MemoryClientPort["list"]>(async () => [document()]),
    delete: vi.fn<MemoryClientPort["delete"]>(async () => ({ deleted: true })),
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
  render(language(<MemoryLibraryPage client={client} ownerKey="account" scope="account" />));
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
  expect(dialog).toHaveTextContent(
    "Future runs of schedules that reference this item will fail and pause the schedule",
  );
  expect(dialog).toHaveTextContent("Existing task snapshots and version history are preserved");
  expect(client.archive).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Archive" }));
  await waitFor(() => expect(client.archive).toHaveBeenCalledTimes(1));
  expect(client.archive.mock.calls[0]?.[0]).toEqual({ id, revision: 2, archived: true });
});

it("checks exact schedule usage before archiving and bounds the plan-name preview", async () => {
  const client = fixture(),
    longName = "😀".repeat(45);
  const scheduledPlans = vi.fn<MemoryUsagePort["scheduledPlans"]>(async () => [
    { id: "plan-1", name: longName, enabled: true },
    { id: "plan-2", name: "Paused\n\n review\t plan", enabled: false },
    { id: "plan-3", name: "Daily review", enabled: true },
    { id: "plan-4", name: "Hidden fourth plan", enabled: true },
    { id: "plan-5", name: "Hidden fifth plan", enabled: false },
  ]);
  render(
    language(
      <MemoryLibraryPage
        client={client}
        ownerKey="account"
        scope="account"
        usage={{ scheduledPlans }}
      />,
    ),
  );
  await screen.findByRole("heading", { name: "Project conventions" });
  expect(scheduledPlans).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Archive: Project conventions" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(scheduledPlans.mock.calls[0]?.[0]).toEqual({ id });
  expect(scheduledPlans.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(dialog).toHaveTextContent("Cloud schedules referencing this item: 5.");
  expect(dialog).toHaveTextContent(`${"😀".repeat(39)}… (Enabled)`);
  expect(dialog).toHaveTextContent("Paused review plan (Paused); Daily review (Enabled)");
  expect(dialog.textContent).not.toMatch(/[\n\t]/u);
  expect(dialog).toHaveTextContent("2 more; review them in Cloud automations.");
  expect(dialog).not.toHaveTextContent(longName);
  expect(dialog).not.toHaveTextContent("Hidden fourth plan");
  expect(dialog).not.toHaveTextContent("Hidden fifth plan");
  expect(client.archive).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
});

it("distinguishes a confirmed zero from unknown schedule usage", async () => {
  const client = fixture(),
    scheduledPlans = vi.fn<MemoryUsagePort["scheduledPlans"]>(async () => []);
  render(
    language(
      <MemoryLibraryPage
        client={client}
        ownerKey="account"
        scope="account"
        usage={{ scheduledPlans }}
      />,
    ),
  );
  await screen.findByRole("heading", { name: "Project conventions" });
  fireEvent.click(screen.getByRole("button", { name: "Archive: Project conventions" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("Cloud schedules referencing this item: 0.");
  expect(dialog).not.toHaveTextContent("Unable to confirm references");
});

it("shows unknown references after a failed usage read and still requires explicit archiving", async () => {
  const client = fixture(),
    scheduledPlans = vi
      .fn<MemoryUsagePort["scheduledPlans"]>()
      .mockRejectedValue(new Error("private jobs diagnostic"));
  render(
    language(
      <MemoryLibraryPage
        client={client}
        ownerKey="account"
        scope="account"
        usage={{ scheduledPlans }}
      />,
    ),
  );
  await screen.findByRole("heading", { name: "Project conventions" });
  fireEvent.click(screen.getByRole("button", { name: "Archive: Project conventions" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent(
    "Unable to confirm references. Review Cloud automations before archiving.",
  );
  expect(dialog).not.toHaveTextContent("Cloud schedules referencing this item: 0.");
  expect(dialog).not.toHaveTextContent("private jobs diagnostic");
  expect(client.archive).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Archive" }));
  await waitFor(() => expect(client.archive).toHaveBeenCalledTimes(1));
});

it("never reads cloud usage while archiving device-owned references", async () => {
  const client = fixture(),
    scheduledPlans = vi.fn<MemoryUsagePort["scheduledPlans"]>();
  render(
    language(
      <MemoryLibraryPage
        client={client}
        ownerKey="device"
        scope="device"
        usage={{ scheduledPlans }}
      />,
    ),
  );
  await screen.findByRole("heading", { name: "Project conventions" });
  fireEvent.click(screen.getByRole("button", { name: "Archive: Project conventions" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("Existing task snapshots and version history are preserved");
  expect(dialog).not.toHaveTextContent("Cloud schedules");
  expect(dialog).not.toHaveTextContent("Unable to confirm references");
  expect(scheduledPlans).not.toHaveBeenCalled();
});

it.each(["account", "usage"] as const)(
  "cancels a pending archive usage read when the %s identity changes",
  async (change) => {
    const client = fixture(),
      pending = deferred<{ id: string; name: string; enabled: boolean }[]>();
    const scheduledPlans = vi.fn<MemoryUsagePort["scheduledPlans"]>(() => pending.promise),
      next = vi.fn<MemoryUsagePort["scheduledPlans"]>(async () => []);
    const usage = { scheduledPlans };
    const view = render(
      language(<MemoryLibraryPage client={client} ownerKey="one" scope="account" usage={usage} />),
    );
    await screen.findByRole("heading", { name: "Project conventions" });
    fireEvent.click(screen.getByRole("button", { name: "Archive: Project conventions" }));
    await waitFor(() => expect(scheduledPlans).toHaveBeenCalledTimes(1));
    const signal = scheduledPlans.mock.calls[0]?.[1]?.signal;
    view.rerender(
      language(
        <MemoryLibraryPage
          client={client}
          ownerKey={change === "account" ? "two" : "one"}
          scope="account"
          usage={change === "usage" ? { scheduledPlans: next } : usage}
        />,
      ),
    );
    await screen.findByRole("heading", { name: "Project conventions" });
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve([{ id: "old-plan", name: "Private old plan", enabled: true }]),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText("Private old plan")).toBeNull();
    expect(client.archive).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  },
);

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
  expect(screen.getByRole("alert")).toHaveTextContent("Permanently delete archived references");
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
  expect(dialog).toHaveTextContent("preserving the reference’s current archived state");
  await userEvent.click(within(dialog).getByRole("button", { name: "Restore version" }));
  await waitFor(() => expect(client.restore).toHaveBeenCalledTimes(1));
  expect(client.restore.mock.calls[0]?.[0]).toEqual({ id, revision: 22, version: 1 });
});

it.each(["en", "zh"] as const)(
  "distinguishes unarchive history from content restoration in %s",
  async (locale) => {
    localStorage.setItem("raypx_locale", locale);
    const client = fixture();
    client.list.mockResolvedValue([document(4)]);
    client.history.mockResolvedValue([
      { ...version(4), reason: "unarchived" },
      { ...version(3), reason: "restored" },
      { ...version(2), reason: "restored", restoredFrom: 1 },
      { ...version(1), reason: "created" },
    ]);
    render(language(<MemoryLibraryPage client={client} ownerKey="account" scope="account" />));
    await screen.findByRole("heading", { name: "Project conventions" });
    fireEvent.click(
      await screen.findByRole("button", {
        name: locale === "en" ? "Version timeline" : "版本时间线",
      }),
    );
    expect(
      await screen.findByRole("button", {
        name: locale === "en" ? /^Revision 4\s*Unarchived/ : /^版本 4\s*取消归档/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: locale === "en" ? /^Revision 3\s*Unarchived/ : /^版本 3\s*取消归档/,
      }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", {
        name: locale === "en" ? /^Revision 2\s*Restored/ : /^版本 2\s*恢复/,
      }),
    );
    expect(
      await screen.findByText(locale === "en" ? "Restored from revision 1" : "从版本 1 恢复"),
    ).toBeVisible();
  },
);

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

it("ignores a preview failure arriving after another preview succeeded", async () => {
  const client = fixture(),
    pending = deferred<ContextDocument>();
  const second = {
    ...document(2, "Second reference"),
    id: crypto.randomUUID(),
    content: "Second preview content",
  };
  client.list.mockResolvedValue([document(), second]);
  client.get.mockImplementation((input) =>
    input.id === id ? pending.promise : Promise.resolve(second),
  );
  render(
    language(
      <ContextPicker
        client={client}
        ownerKey="account"
        target={{ deviceId, projectId }}
        value={{ sources: [] }}
        onChange={() => {}}
      />,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Preview: Project conventions" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview: Second reference" }));
  expect(await screen.findByText("Second preview content")).toBeVisible();
  await act(async () => pending.reject(new Error("CONTEXT_NOT_FOUND: private late failure")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Second preview content")).toBeVisible();
});

it("clears a previous preview error when a later preview succeeds", async () => {
  const client = fixture();
  client.get
    .mockRejectedValueOnce(new Error("CONTEXT_NOT_FOUND: private failure"))
    .mockResolvedValueOnce(document());
  render(
    language(
      <ContextPicker
        client={client}
        ownerKey="device"
        target={{ deviceId, projectId }}
        value={{ sources: [] }}
        onChange={() => {}}
      />,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Preview: Project conventions" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("This reference is unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Preview: Project conventions" }));
  expect(await screen.findByText("Reference revision 2")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["close", "refresh", "collapse"] as const)(
  "invalidates a pending preview on %s",
  async (action) => {
    const client = fixture(),
      pending = deferred<ContextDocument>();
    const second = {
      ...document(2, "Second reference"),
      id: crypto.randomUUID(),
      content: "Second preview content",
    };
    client.list.mockResolvedValue([document(), second]);
    client.get.mockResolvedValueOnce(second).mockImplementationOnce(() => pending.promise);
    render(
      language(
        <ContextPicker
          client={client}
          ownerKey="account"
          target={{ deviceId, projectId }}
          value={{ sources: [] }}
          onChange={() => {}}
        />,
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Preview: Second reference" }));
    await screen.findByText("Second preview content");
    fireEvent.click(screen.getByRole("button", { name: "Preview: Project conventions" }));
    if (action === "collapse")
      await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
    else
      fireEvent.click(
        screen.getByRole("button", { name: action === "close" ? "Close" : "Refresh" }),
      );
    await act(async () => {
      if (action === "refresh") pending.resolve(document());
      else pending.reject(new Error("CONTEXT_NOT_FOUND: private late failure"));
    });
    if (action === "collapse")
      await userEvent.click(screen.getByRole("button", { name: /Memory and templates/ }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Second preview content")).toBeNull();
    expect(screen.queryByText("Reference revision 2")).toBeNull();
  },
);

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

it("permanently deletes an archived reference only after confirmation and keeps failed deletions retryable", async () => {
  const client = fixture(),
    archived = { ...document(), archived: true };
  client.list.mockResolvedValue([archived]);
  client.delete.mockRejectedValueOnce(new Error("private deletion error"));
  render(language(<MemoryLibraryPage client={client} ownerKey="owner" scope="device" />));
  await screen.findByText(/No references match/);
  await userEvent.click(screen.getByRole("checkbox", { name: "Include archived" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Permanently delete Project conventions" }),
  );
  const dialog = screen.getByRole("alertdialog");
  expect(within(dialog).getByText(/all its versions/)).toBeVisible();
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(client.delete).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Permanently delete Project conventions" }),
  );
  await userEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete permanently" }),
  );
  await screen.findByRole("alert");
  expect(screen.queryByText("private deletion error")).toBeNull();
  expect(screen.getByRole("heading", { name: "Project conventions" })).toBeVisible();
  client.list.mockResolvedValue([]);
  await userEvent.click(
    screen.getByRole("button", { name: "Permanently delete Project conventions" }),
  );
  await userEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete permanently" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Project conventions" })).toBeNull(),
  );
  expect(client.delete).toHaveBeenLastCalledWith(
    { id, revision: 2 },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

it("measures the selected historical version and updates on typing without refetching bodies", async () => {
  const client = fixture(),
    changed = vi.fn(),
    old = { ...version(1), content: '# "Heading"\n- item \\ path' };
  client.history.mockResolvedValue([old]);
  const value = { sources: [{ id, revision: 1 }] },
    target = { deviceId, projectId };
  const props = { client, ownerKey: "owner", target, value, prompt: "Task", onChange: changed };
  const page = render(language(<ContextBudget {...props} />));
  const expected = taskExecutionBudget({ prompt: "Task", context: { sources: [old] } });
  await waitFor(() =>
    expect(screen.getByLabelText("Reference and task budget")).toHaveTextContent(
      `${expected.characters} / 32000`,
    ),
  );
  page.rerender(language(<ContextBudget {...props} prompt={"x".repeat(32_000)} />));
  await screen.findByRole("alert");
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "ready", exceeded: true }),
  );
  expect(client.get).toHaveBeenCalledTimes(1);
  expect(client.history).toHaveBeenCalledTimes(1);
  expect(client.resolve).not.toHaveBeenCalled();
});

it("ignores an old owner's late budget failure and aborts its requests", async () => {
  const client = fixture(),
    old = deferred<ContextDocument>(),
    changed = vi.fn();
  client.get.mockReturnValueOnce(old.promise);
  const props = {
    client,
    target: { deviceId, projectId },
    value: { sources: [{ id, revision: 2 }] },
    prompt: "Task",
    onChange: changed,
  };
  const page = render(language(<ContextBudget {...props} ownerKey="old-owner" />));
  await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));
  const signal = client.get.mock.calls[0]?.[1]?.signal;
  page.rerender(language(<ContextBudget {...props} ownerKey="new-owner" />));
  await screen.findByLabelText("Reference and task budget");
  await act(async () => old.reject(new Error("Old private failure")));
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      key: expect.stringContaining("new-owner"),
      status: "ready",
      exceeded: false,
    }),
  );
});

it("keeps unknown budgets blocked until a deliberate retry succeeds", async () => {
  const client = fixture(),
    changed = vi.fn();
  client.get.mockRejectedValueOnce(new Error("private service details"));
  render(
    language(
      <ContextBudget
        client={client}
        ownerKey="owner"
        target={{ deviceId, projectId }}
        value={{ sources: [{ id, revision: 2 }] }}
        prompt="Task"
        onChange={changed}
      />,
    ),
  );
  await screen.findByRole("alert");
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ status: "error" }));
  expect(screen.queryByText("private service details")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Recalculate budget" }));
  await screen.findByLabelText("Reference and task budget");
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: "ready", exceeded: false }),
  );
});
