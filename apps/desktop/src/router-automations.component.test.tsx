/** @vitest-environment happy-dom */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import type { RootGrant } from "@raypx/contracts/local";
import type { JobDefinition } from "@raypx/jobs/model";
import {
  mocks,
  grants,
  job,
  deferred,
  testRouter,
  mount,
  page,
} from "../tests/helpers/router-local.tsx";
import userEvent from "@testing-library/user-event";

describe("Desktop local file routes", () => {
  it("loads jobs and roots in parallel through hash history and contains auxiliary roots failures", async () => {
    const jobs = deferred<JobDefinition[]>();
    const roots = deferred<RootGrant[]>();
    mocks.localRequest.mockImplementation((method) => {
      if (method === "jobs.list") return jobs.promise;
      if (method === "roots.list") return roots.promise;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = testRouter("/automations", { hash: true });
    const loading = router.load();
    await waitFor(() => {
      expect(mocks.localRequest).toHaveBeenCalledWith("jobs.list", {});
      expect(mocks.localRequest).toHaveBeenCalledWith("roots.list", {});
    });
    await act(async () => {
      jobs.resolve([job()]);
      roots.reject(new Error("private roots diagnostic"));
      await loading;
    });
    mount(router);
    expect(router.state.location.pathname).toBe("/automations");
    expect(screen.getByRole("heading", { name: "Nightly scan" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("private roots diagnostic")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New automation" }));
    expect(screen.getByRole("combobox", { name: "Folder" })).toHaveTextContent(
      "Choose a folder in Files first",
    );
  });

  it("defaults new automations to the open project and keeps unassigned schedules globally accessible", async () => {
    const existing = job("Unassigned scan");
    mocks.localRequest.mockImplementation(async (method) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "jobs.list")
        return [existing, { ...job("Project scan"), id: "project-job", projectId: "work" }];
      if (method === "roots.list") return grants;
      if (method === "jobs.create" || method === "jobs.update") return existing;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = await page("/automations?scope=local&project=work");
    expect(screen.getByRole("heading", { name: "Project scan" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Unassigned scan" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "New automation" }));
    expect(screen.getByRole("combobox", { name: "Project" })).toHaveTextContent("Work");
    expect(screen.getByRole("combobox", { name: "Folder" })).toHaveTextContent("Work");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New project scan" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.localRequest).toHaveBeenCalledWith(
        "jobs.create",
        expect.objectContaining({
          projectId: "work",
          action: { type: "directory.scan", rootId: "work", path: "" },
        }),
      ),
    );
    await userEvent.click(
      screen.getByRole("link", { name: "Manage all automations, including unassigned plans" }),
    );
    expect(router.state.location.search.project).toBeUndefined();
    expect(await screen.findByRole("heading", { name: "Unassigned scan" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit: Unassigned scan" }));
    expect(screen.getByRole("combobox", { name: "Project" })).toHaveTextContent("General plan");
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.localRequest).toHaveBeenCalledWith(
        "jobs.update",
        expect.objectContaining({ id: existing.id }),
      ),
    );
    const update = mocks.localRequest.mock.calls.find(([method]) => method === "jobs.update")?.[1];
    expect(update).not.toHaveProperty("projectId");
  });

  it("shows pending UI until the initial jobs loader finishes", async () => {
    const jobs = deferred<JobDefinition[]>();
    const roots = deferred<RootGrant[]>();
    mocks.localRequest.mockImplementation((method) => {
      if (method === "jobs.list") return jobs.promise;
      if (method === "roots.list") return roots.promise;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = testRouter("/automations");
    const loading = router.load();
    mount(router);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Nightly scan" })).toBeNull();
    await act(async () => {
      jobs.resolve([job()]);
      roots.resolve(grants);
      await loading;
    });
    expect(await screen.findByRole("heading", { name: "Nightly scan" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a safe jobs error and recovers through the refresh button without an event", async () => {
    let failed = true;
    mocks.localRequest.mockImplementation(async (method) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "jobs.list") {
        if (failed) throw new Error("private jobs diagnostic");
        return [job("Recovered automation")];
      }
      if (method === "roots.list") return grants;
      throw new Error(`Unexpected local request: ${method}`);
    });
    const router = await page("/automations");
    expect(router.state.location.pathname).toBe("/automations");
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(screen.queryByText("private jobs diagnostic")).toBeNull();
    expect(screen.getByRole("heading", { name: "Automations" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New automation" }));
    expect(screen.getByRole("combobox", { name: "Folder" })).toHaveTextContent("Work");
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("heading", { name: "Recovered automation" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(router.state.location.pathname).toBe("/automations");
  });

  it("opens run output with a keyboard-accessible history disclosure", async () => {
    const user = userEvent.setup();
    mocks.localRequest.mockImplementation(async (method) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "jobs.list") return [job()];
      if (method === "roots.list") return grants;
      if (method === "jobs.history")
        return [
          {
            id: "run-1",
            jobId: "job-1",
            startedAt: "2026-10-24T09:00:00.000Z",
            finishedAt: "2026-10-24T09:00:01.000Z",
            status: "success",
            output: "Synthetic scan output",
            exitCode: 0,
          },
        ];
      throw new Error(`Unexpected local request: ${method}`);
    });
    await page("/automations");
    fireEvent.click(screen.getByRole("button", { name: "Run history" }));
    const toggle = await screen.findByRole("button", { name: /Exit code: 0/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(await screen.findByText("Synthetic scan output")).toBeVisible();
    await user.keyboard("[Space]");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("reloads route data after creating, updating and deleting an automation", async () => {
    let jobs: JobDefinition[] = [];
    mocks.localRequest.mockImplementation(async (method) => {
      if (method.startsWith("instance.")) return { state: "registered" };
      if (method === "jobs.list") return jobs;
      if (method === "roots.list") return grants;
      if (method === "jobs.create") {
        jobs = [job()];
        return jobs[0];
      }
      if (method === "jobs.update") {
        jobs = [{ ...job(), enabled: false }];
        return jobs[0];
      }
      if (method === "jobs.delete") {
        jobs = [];
        return true;
      }
      throw new Error(`Unexpected local request: ${method}`);
    });
    await page("/automations");
    fireEvent.click(screen.getByRole("button", { name: "New automation" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Nightly scan" } });
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "UTC" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
    expect(await screen.findByRole("heading", { name: "Nightly scan" })).toBeTruthy();
    expect(mocks.localRequest).toHaveBeenCalledWith(
      "jobs.create",
      expect.objectContaining({
        name: "Nightly scan",
        timezone: "UTC",
        action: { type: "directory.scan", rootId: "work", path: "" },
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause: Nightly scan" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause: Nightly scan" }));
    expect(await screen.findByRole("button", { name: "Enable: Nightly scan" })).toBeTruthy();
    expect(mocks.localRequest).toHaveBeenCalledWith(
      "jobs.update",
      expect.objectContaining({
        id: "job-1",
        enabled: false,
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete: Nightly scan" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete: Nightly scan" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete: Nightly scan" });
    expect(mocks.localRequest.mock.calls.some(([method]) => method === "jobs.delete")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("heading", { name: "Nothing scheduled yet" })).toBeTruthy();
    expect(mocks.localRequest).toHaveBeenCalledWith("jobs.delete", { id: "job-1" });
    expect(mocks.localRequest.mock.calls.filter(([method]) => method === "jobs.list")).toHaveLength(
      4,
    );
  });
});
