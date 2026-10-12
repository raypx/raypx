import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const api = vi.hoisted(() => ({
  projects: { list: vi.fn(), get: vi.fn(), create: vi.fn(), tasks: { list: vi.fn() } },
}));
vi.mock("@voidmix/client", () => ({ createApiClient: () => api }));
vi.mock("../env", () => ({ env: { VITE_API_URL: "https://api.example.test" } }));

import { loadProject, loadProjects } from "./projects";

beforeEach(() => vi.resetAllMocks());

describe("project route transport", () => {
  it("passes route cancellation to both project reads", async () => {
    const { signal } = new AbortController();
    api.projects.list.mockResolvedValue({ items: [], nextCursor: null });
    api.projects.get.mockResolvedValue({ project: { id: "project" }, access: "read" });
    api.projects.tasks.list.mockResolvedValue({ items: [] });
    await expect(loadProjects(signal)).resolves.toEqual({
      status: "loaded",
      data: { items: [], nextCursor: null },
    });
    await expect(loadProject("project", signal)).resolves.toEqual({
      status: "loaded",
      data: { id: "project", access: "read", tasks: [] },
    });
    expect(api.projects.list).toHaveBeenCalledWith({ limit: 50 }, { signal });
    expect(api.projects.get).toHaveBeenCalledWith({ projectId: "project" }, { signal });
    expect(api.projects.tasks.list).toHaveBeenCalledWith({ projectId: "project" }, { signal });
  });

  it("propagates cancelled reads instead of presenting them as unavailable", async () => {
    const controller = new AbortController();
    const reason = new Error("Route left");
    controller.abort(reason);
    api.projects.list.mockRejectedValue(reason);
    api.projects.get.mockRejectedValue(reason);
    await expect(loadProjects(controller.signal)).rejects.toBe(reason);
    await expect(loadProject("old", controller.signal)).rejects.toBe(reason);
  });

  it("preserves the unavailable state for actual API failures", async () => {
    api.projects.list.mockRejectedValue(new Error("offline"));
    api.projects.get.mockRejectedValue(new Error("offline"));
    await expect(loadProjects()).resolves.toEqual({ status: "unavailable", data: null });
    await expect(loadProject("project-1")).resolves.toEqual({ status: "unavailable", data: null });
  });

  it.each([
    ["UNAUTHORIZED", "signedOut"],
    ["FORBIDDEN", "accessDenied"],
  ] as const)("keeps %s separate from a failed connection", async (code, reason) => {
    api.projects.list.mockRejectedValue({ code });
    api.projects.get.mockRejectedValue({ code });
    await expect(loadProjects()).resolves.toEqual({ status: "unavailable", data: null, reason });
    await expect(loadProject("private")).resolves.toEqual({
      status: "unavailable",
      data: null,
      reason,
    });
  });

  it("routes missing projects to the not-found boundary", async () => {
    api.projects.get.mockRejectedValue({ code: "NOT_FOUND" });
    await expect(loadProject("missing")).resolves.toEqual({ status: "loaded", data: null });
  });
});
