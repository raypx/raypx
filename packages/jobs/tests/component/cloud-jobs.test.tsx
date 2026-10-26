/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import type { CloudJob, CloudJobRun } from "../../src/index.js";
import type { CloudJobsPort, JobDevicesPort } from "../../src/client.js";
import { CloudJobsPage, type CloudJobsPageProps } from "../../src/client.js";

expect.extend(matchers);
const deviceId = "11111111-1111-4111-8111-111111111111",
  projectId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333",
  runId = "44444444-4444-4444-8444-444444444444";
function job(name = "Cloud sync"): CloudJob {
  return {
    id: jobId,
    revision: 4,
    name,
    cron: "0 9 * * 1-5",
    timezone: "UTC",
    enabled: true,
    action: { type: "device.sync", deviceId, epoch: 2 },
    createdAt: "2026-10-26T00:00:00Z",
    updatedAt: "2026-10-26T00:00:00Z",
    nextRunAt: "2026-10-27T09:00:00Z",
  };
}
function run(): CloudJobRun {
  return {
    id: runId,
    jobId,
    jobRevision: 4,
    trigger: "manual",
    scheduledFor: "2026-10-26T00:00:00Z",
    startedAt: "2026-10-26T00:00:00Z",
    finishedAt: null,
    status: "unknown",
    action: {
      type: "agent.run",
      deviceId,
      epoch: 2,
      projectId,
      provider: "codex",
      mode: "run",
      prompt: "Scheduled instructions",
    },
    taskId: runId,
    code: "DELIVERY_UNCERTAIN",
    sync: null,
  };
}
function fixture() {
  const client = {
    list: vi.fn<CloudJobsPort["list"]>(async () => ({ enabled: true, jobs: [job()] })),
    create: vi.fn<CloudJobsPort["create"]>(async (input) => ({ ...job(), ...input })),
    update: vi.fn<CloudJobsPort["update"]>(async (input) => ({
      ...job(),
      ...input.job,
      revision: input.revision + 1,
    })),
    remove: vi.fn<CloudJobsPort["remove"]>(async () => ({ deleted: true })),
    run: vi.fn<CloudJobsPort["run"]>(async () => run()),
    history: vi.fn<CloudJobsPort["history"]>(async () => [run()]),
  };
  const devices: JobDevicesPort = {
    list: async () => [
      {
        id: deviceId,
        epoch: 2,
        name: "Studio Mac",
        online: true,
        projects: [{ id: projectId, name: "Raypx" }],
        capabilities: [{ provider: "codex", available: true }],
      },
    ],
  };
  return { client, devices };
}
const link = (id: string) => <a href={`/tasks?taskId=${id}`}>Open related agent task</a>;
function page(props: Omit<CloudJobsPageProps, "renderTaskLink">) {
  return (
    <BrowserLanguageProvider>
      <CloudJobsPage {...props} renderTaskLink={link} />
    </BrowserLanguageProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  const style = document.createElement("style");
  style.dataset.jobsMotion = "true";
  style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
  document.head.append(style);
});
afterEach(() => {
  cleanup();
  document.querySelector("[data-jobs-motion]")?.remove();
  vi.restoreAllMocks();
});
async function choose(name: string, value: string) {
  const user = userEvent.setup();
  let label = "";
  await waitFor(async () => {
    const trigger = screen.getByRole("combobox", { name });
    const accepted = () =>
      label &&
      trigger.querySelector('[data-slot="select-value"]')?.textContent?.trim() === label &&
      trigger.getAttribute("aria-expanded") !== "true";
    if (accepted()) return;
    if (trigger.getAttribute("aria-expanded") !== "true") {
      trigger.focus();
      await user.keyboard("{ArrowDown}");
    }
    const option = screen
      .getAllByRole("option")
      .find((item) => item.getAttribute("data-value") === value);
    if (!option || !option.isConnected || option.closest('[aria-hidden="true"]'))
      throw new Error("Select is not interactive");
    label = option.textContent?.trim() ?? "";
    await user.click(option);
    if (!accepted()) throw new Error("Select did not accept the choice");
  });
}

it("keeps schedule controls and history available when the first device read fails", async () => {
  const { client } = fixture();
  const devices: JobDevicesPort = {
    list: vi.fn<JobDevicesPort["list"]>().mockRejectedValue(new Error("private device diagnostic")),
  };
  render(page({ accountId: "one", client, devices }));
  expect(await screen.findByRole("heading", { name: "Cloud sync" })).toBeVisible();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to complete the request.");
  expect(screen.queryByText("private device diagnostic")).toBeNull();
  expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Pause: Cloud sync" }));
  await waitFor(() => expect(client.update).toHaveBeenCalledTimes(1));
  expect(client.update.mock.calls[0]?.[0]).toMatchObject({
    id: jobId,
    revision: 4,
    job: { enabled: false },
  });
  await waitFor(() => expect(screen.getByRole("button", { name: "Run history" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Run history" }));
  expect(await screen.findByRole("button", { name: /Delivery uncertain/ })).toBeVisible();
});

it("applies refreshed schedules while retaining the last successful device directory", async () => {
  const { client, devices: directory } = fixture();
  const list = vi.fn<JobDevicesPort["list"]>((input, options) => directory.list(input, options));
  const devices: JobDevicesPort = { list };
  render(page({ accountId: "one", client, devices }));
  await screen.findByRole("heading", { name: "Cloud sync" });
  expect(screen.getByText("Studio Mac")).toBeVisible();
  list.mockRejectedValueOnce(new Error("private device diagnostic"));
  client.list.mockResolvedValue({ enabled: true, jobs: [job("Updated schedule")] });
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByRole("heading", { name: "Updated schedule" })).toBeVisible();
  expect(screen.getByText("Studio Mac")).toBeVisible();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to complete the request.");
  expect(screen.queryByText("private device diagnostic")).toBeNull();
});

it("creates an agent schedule with explicit target epoch and no immediate task execution", async () => {
  const { client, devices } = fixture();
  render(page({ accountId: "one", client, devices }));
  await screen.findByRole("heading", { name: "Cloud sync" });
  fireEvent.click(screen.getByRole("button", { name: "New cloud automation" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Morning review" } });
  await userEvent.click(screen.getByRole("radio", { name: "Create an agent task" }));
  fireEvent.change(screen.getByLabelText("Task instructions"), {
    target: { value: "Review the changes" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
  await waitFor(() => expect(client.create).toHaveBeenCalledTimes(1));
  expect(client.create.mock.calls[0]?.[0]).toMatchObject({
    name: "Morning review",
    enabled: true,
    action: {
      type: "agent.run",
      deviceId,
      epoch: 2,
      projectId,
      provider: "codex",
      mode: "run",
      prompt: "Review the changes",
    },
  });
  expect(client.run).not.toHaveBeenCalled();
});

it("requires an explicit current connection when an edited device epoch is stale", async () => {
  const { client, devices } = fixture();
  client.list.mockResolvedValue({
    enabled: true,
    jobs: [{ ...job(), action: { type: "device.sync", deviceId, epoch: 1 } }],
  });
  render(page({ accountId: "one", client, devices }));
  await screen.findByRole("heading", { name: "Cloud sync" });
  fireEvent.click(screen.getByRole("button", { name: "Edit: Cloud sync" }));
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(client.update).not.toHaveBeenCalled();
  await choose("Computer", `${deviceId}:2`);
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
  await waitFor(() => expect(client.update).toHaveBeenCalledTimes(1));
  expect(client.update.mock.calls[0]?.[0]).toMatchObject({
    id: jobId,
    revision: 4,
    job: { action: { deviceId, epoch: 2 } },
  });
});

it("preserves edits after a CAS conflict and does not retry a write automatically", async () => {
  const { client, devices } = fixture();
  client.update.mockRejectedValue({ data: { error: { code: "JOB_CONFLICT" } } });
  render(page({ accountId: "one", client, devices }));
  await screen.findByRole("heading", { name: "Cloud sync" });
  fireEvent.click(screen.getByRole("button", { name: "Edit: Cloud sync" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My unsaved name" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This schedule was changed by another request.",
  );
  expect(screen.getByLabelText("Name")).toHaveValue("My unsaved name");
  expect(client.update).toHaveBeenCalledTimes(1);
});

it("retains one creation intent after a lost response even if its fields change", async () => {
  const { client, devices } = fixture();
  client.create.mockRejectedValueOnce(new Error("private timeout"));
  client.create.mockRejectedValueOnce({ data: { error: { code: "IDEMPOTENCY_CONFLICT" } } });
  render(page({ accountId: "one", client, devices }));
  await screen.findByRole("heading", { name: "Cloud sync" });
  fireEvent.click(screen.getByRole("button", { name: "New cloud automation" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "First intent" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
  await screen.findByRole("alert");
  const first = client.create.mock.calls[0]?.[0];
  expect(first?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Changed intent" } });
  fireEvent.click(screen.getByRole("button", { name: "New cloud automation" }));
  expect(screen.getByLabelText("Name")).toHaveValue("Changed intent");
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Refresh and check the original schedule or run before editing.",
  );
  expect(client.create.mock.calls[1]?.[0].requestId).toBe(first?.requestId);
  expect(client.create.mock.calls[1]?.[0].name).toBe("Changed intent");
  expect(screen.getByLabelText("Name")).toHaveValue("Changed intent");
});

it("reuses a manual run request ID after an uncertain response and links immutable history", async () => {
  const { client, devices } = fixture();
  client.run.mockRejectedValueOnce(new Error("private network diagnostic"));
  render(page({ accountId: "one", client, devices }));
  await screen.findByRole("heading", { name: "Cloud sync" });
  fireEvent.click(screen.getByRole("button", { name: "Run now" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Check previous run" }));
  await waitFor(() => expect(client.run).toHaveBeenCalledTimes(2));
  expect(client.run.mock.calls[0]?.[0].requestId).toBe(client.run.mock.calls[1]?.[0].requestId);
  const trigger = await screen.findByRole("button", { name: /Delivery uncertain/ });
  await userEvent.click(trigger);
  expect(await screen.findByRole("link", { name: "Open related agent task" })).toHaveAttribute(
    "href",
    `/tasks?taskId=${runId}`,
  );
  expect(screen.getByText("Scheduled instructions")).toBeVisible();
  expect(screen.queryByText("private network diagnostic")).toBeNull();
});

it.each(["account", "client"] as const)(
  "cancels old %s requests and hides late private results",
  async (change) => {
    const first = fixture(),
      second = fixture();
    let resolve!: (value: { enabled: boolean; jobs: CloudJob[] }) => void;
    first.client.list.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = render(page({ accountId: "one", ...first }));
    await waitFor(() => expect(first.client.list).toHaveBeenCalledTimes(1));
    const signal = first.client.list.mock.calls[0]?.[1]?.signal;
    const next = change === "account" ? first : second;
    next.client.list.mockResolvedValue({ enabled: true, jobs: [job("Current private data")] });
    view.rerender(page({ accountId: change === "account" ? "two" : "one", ...next }));
    expect(await screen.findByRole("heading", { name: "Current private data" })).toBeVisible();
    expect(signal?.aborted).toBe(true);
    resolve({ enabled: true, jobs: [job("Private late data")] });
    await waitFor(() => expect(screen.queryByText("Private late data")).toBeNull());
  },
);

it("confirms revision-based deletion of schedule history while preserving created tasks", async () => {
  const { client, devices } = fixture();
  render(page({ accountId: "one", client, devices }));
  await screen.findByRole("heading", { name: "Cloud sync" });
  fireEvent.click(screen.getByRole("button", { name: "Delete: Cloud sync" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent(
    "Delete this schedule and its run history? Agent tasks already created will remain.",
  );
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(client.remove).toHaveBeenCalledTimes(1));
  expect(client.remove.mock.calls[0]?.[0]).toEqual({ id: jobId, revision: 4 });
});
