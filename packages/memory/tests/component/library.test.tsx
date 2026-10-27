/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";
import type { ContextDocument } from "../../src/index.js";
import { MemoryLibraryPage, type MemoryUsagePort } from "../../src/client.js";
import {
  document,
  version,
  deferred,
  fixture,
  language,
  id,
  setupMemoryClientTests,
} from "../helpers/client";
setupMemoryClientTests();

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
