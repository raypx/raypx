/** @vitest-environment happy-dom */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import type { LocalMethod } from "@raypx/contracts/local";
import type { JobDefinition } from "@raypx/jobs/model";
import { mocks, grants, job, deferred, emit, page } from "../tests/helpers/router-local.tsx";

describe("Desktop local file routes", () => {
  it("keeps job events out of Files requests while engine readiness refreshes its lists", async () => {
    await page("/files");
    expect(await screen.findByText("This folder is empty.")).toBeTruthy();
    const reads = (method: LocalMethod) =>
      mocks.localRequest.mock.calls.filter(([called]) => called === method).length;
    const initialRoots = reads("roots.list");
    const initialFiles = reads("files.list");
    await act(async () => emit("job.finished", { id: "job-1" }));
    expect(reads("jobs.list")).toBe(0);
    expect(reads("roots.list")).toBe(initialRoots);
    expect(reads("files.list")).toBe(initialFiles);

    await act(async () => emit("engine.status", { status: "ready" }));
    await waitFor(() => {
      expect(reads("roots.list")).toBe(initialRoots + 1);
      expect(reads("files.list")).toBe(initialFiles + 1);
    });
    expect(reads("jobs.list")).toBe(0);
  });

  it("invalidates jobs for relevant events only while their route is active", async () => {
    let jobs = [job("Before event")];
    mocks.localRequest.mockImplementation(async (method) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "jobs.list") return jobs;
      if (method === "roots.list") return grants;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = await page("/automations");
    expect(screen.getByRole("heading", { name: "Before event" })).toBeTruthy();
    expect(mocks.listeners.size).toBeGreaterThan(0);
    const reads = () =>
      mocks.localRequest.mock.calls.filter(([method]) => method === "jobs.list").length;
    const initialReads = reads();
    await act(async () => {
      emit("engine.status", { status: "starting" });
      emit("terminal.output", { id: "terminal-1", data: "YQ==" });
    });
    expect(reads()).toBe(initialReads);

    jobs = [job("After engine ready")];
    await act(async () => emit("engine.status", { status: "ready" }));
    expect(await screen.findByRole("heading", { name: "After engine ready" })).toBeTruthy();
    expect(reads()).toBe(initialReads + 1);
    jobs = [job("After job finished")];
    await act(async () => emit("job.finished", { id: "job-1" }));
    expect(await screen.findByRole("heading", { name: "After job finished" })).toBeTruthy();
    expect(reads()).toBe(initialReads + 2);

    await act(async () => router.navigate({ to: "/settings" }));
    const beforeUnmountedEvent = mocks.localRequest.mock.calls.length;
    await act(async () => emit("job.finished", { id: "job-1" }));
    expect(mocks.localRequest).toHaveBeenCalledTimes(beforeUnmountedEvent);
  });

  it("retains successful rows, form edits and history through a failed refresh and recovers later", async () => {
    let jobs = [job()];
    let failed = false;
    mocks.localRequest.mockImplementation(async (method) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "jobs.history") return [];
      if (failed) throw new Error("private refresh diagnostic");
      if (method === "jobs.list") return jobs;
      if (method === "roots.list") return grants;
      throw new Error(`Unexpected local request: ${method}`);
    });
    await page("/automations");
    fireEvent.click(screen.getByRole("button", { name: "Run history" }));
    expect(await screen.findByText("No runs yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit: Nightly scan" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved draft" } });

    failed = true;
    await act(async () => emit("job.finished", { id: "job-1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(screen.getByRole("heading", { name: "Nightly scan" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toHaveValue("Unsaved draft");
    expect(screen.getByRole("combobox", { name: "Folder" })).toHaveTextContent("Work");
    expect(screen.getByText("No runs yet.")).toBeTruthy();
    expect(screen.queryByText("private refresh diagnostic")).toBeNull();

    failed = false;
    jobs = [job("Updated on server")];
    await act(async () => emit("engine.status", { status: "ready" }));
    expect(await screen.findByRole("heading", { name: "Updated on server" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveValue("Unsaved draft");
    expect(screen.getByText("No runs yet.")).toBeTruthy();
  });

  it("keeps a late jobs refresh from replacing the route after navigating away", async () => {
    const lateJobs = deferred<JobDefinition[]>();
    let refreshing = false;
    mocks.localRequest.mockImplementation(async (method) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "jobs.list") return refreshing ? lateJobs.promise : [job()];
      if (method === "roots.list") return grants;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = await page("/automations");
    refreshing = true;
    await act(async () => emit("job.finished", { id: "job-1" }));
    await waitFor(() => {
      expect(
        mocks.localRequest.mock.calls.filter(([method]) => method === "jobs.list"),
      ).toHaveLength(2);
    });
    await act(async () => router.navigate({ to: "/settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
    await act(async () => lateJobs.resolve([job("Late automation")]));
    expect(router.state.location.pathname).toBe("/settings");
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Late automation" })).toBeNull();
  });
});
