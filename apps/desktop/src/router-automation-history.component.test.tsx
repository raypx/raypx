/** @vitest-environment happy-dom */
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import type { JobRun } from "@raypx/core/jobs";
import { mocks, grants, job, deferred, emit, page } from "../tests/helpers/router-local.js";

const first = job("First scan");
const second = { ...job("Second scan"), id: "job-2" };
const run: JobRun = {
  id: "run-1",
  jobId: first.id,
  startedAt: "2026-11-09T09:00:00.000Z",
  finishedAt: null,
  status: "running",
  output: "",
  exitCode: null,
};

function readHistory(name: string) {
  fireEvent.click(
    within(screen.getByRole("heading", { name }).closest("article")!).getByRole("button", {
      name: "Run history",
    }),
  );
}

it.each(["success", "failure"])(
  "ignores an older history %s after selecting another automation",
  async (outcome) => {
    const older = deferred<JobRun[]>();
    mocks.localRequest.mockImplementation(async (method, input) => {
      if (method === "roots.list") return grants;
      if (method === "jobs.list") return [first, second];
      if (method === "jobs.history")
        return (input as { id: string }).id === first.id ? older.promise : [];
      throw new Error(`Unexpected local request: ${method}`);
    });
    await page("/automations");
    readHistory(first.name);
    readHistory(second.name);
    await screen.findByRole("heading", { name: "Second scan · Run history" });
    await act(async () => {
      if (outcome === "success") older.resolve([run]);
      else older.reject(new Error("Private history failure"));
    });
    expect(screen.getByRole("heading", { name: "Second scan · Run history" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "First scan · Run history" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  },
);

it("keeps history closed after an outstanding refresh completes", async () => {
  const pending = deferred<JobRun[]>();
  let refreshing = false;
  mocks.localRequest.mockImplementation(async (method) => {
    if (method === "roots.list") return grants;
    if (method === "jobs.list") return [first];
    if (method === "jobs.history") return refreshing ? pending.promise : [];
    throw new Error(`Unexpected local request: ${method}`);
  });
  await page("/automations");
  readHistory(first.name);
  await screen.findByRole("heading", { name: "First scan · Run history" });
  refreshing = true;
  readHistory(first.name);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await act(async () => pending.resolve([run]));
  expect(screen.queryByRole("heading", { name: "First scan · Run history" })).toBeNull();
});

it("refreshes open history when its job finishes or the engine reconnects", async () => {
  let runs = [run];
  mocks.localRequest.mockImplementation(async (method) => {
    if (method === "roots.list") return grants;
    if (method === "jobs.list") return [first];
    if (method === "jobs.history") return runs;
    throw new Error(`Unexpected local request: ${method}`);
  });
  await page("/automations");
  readHistory(first.name);
  await screen.findByRole("button", { name: /Running/ });
  await act(async () => emit("job.finished", { ...run, jobId: second.id }));
  expect(
    mocks.localRequest.mock.calls.filter(([method]) => method === "jobs.history"),
  ).toHaveLength(1);
  runs = [{ ...run, status: "success", exitCode: 0, finishedAt: "2026-11-09T09:00:01.000Z" }];
  await act(async () => emit("job.finished", runs[0]));
  expect(await screen.findByRole("button", { name: /Succeeded/ })).toBeTruthy();
  runs = [{ ...run, status: "interrupted", finishedAt: "2026-11-09T09:00:02.000Z" }];
  await act(async () => emit("engine.status", { status: "ready" }));
  expect(await screen.findByRole("button", { name: /Interrupted/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  const reads = mocks.localRequest.mock.calls.filter(
    ([method]) => method === "jobs.history",
  ).length;
  await act(async () => emit("job.finished", runs[0]));
  expect(
    mocks.localRequest.mock.calls.filter(([method]) => method === "jobs.history"),
  ).toHaveLength(reads);
});
