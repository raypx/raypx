/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { I18nProvider } from "@raypx/i18n/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReactNode } from "react";

import { messages } from "./i18n/messages";
import { getRouter } from "./router";
import { useDesktopPreferences } from "./lib/preferences";
import { Route as rootRoute } from "./routes/__root";

const loaders = vi.hoisted(() => ({
  loadAccount: vi.fn(),
  loadProjects: vi.fn(),
  loadProject: vi.fn(),
  createProject: vi.fn(),
  createTask: vi.fn(),
}));

function project(id: string, title: string) {
  return {
    id,
    title,
    description: "A focused brief",
    stage: "draft",
    access: "manage",
    tasks: [],
    organizationId: null,
    deadline: null,
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

vi.mock("./lib/projects", () => loaders);
vi.mock("./lib/account", () => ({ loadAccount: loaders.loadAccount }));
vi.mock("./env", () => ({ env: {} }));

function renderRoute(path: string) {
  const router = getRouter();
  // Exercise the real route tree inside jsdom; the Start build owns the HTML document.
  Object.assign(rootRoute.options, {
    shellComponent: ({ children }: { children: ReactNode }) => children,
  });
  router.update({
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  render(
    <I18nProvider locale="en" messages={messages}>
      <RouterProvider router={router} />
    </I18nProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.resetAllMocks();
  useDesktopPreferences.setState(useDesktopPreferences.getInitialState(), true);
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  loaders.loadAccount.mockResolvedValue({
    status: "signed_in",
    profile: { id: "user-1", email: "user@example.test", displayName: "Desktop user" },
  });
  loaders.loadProjects.mockResolvedValue({
    status: "loaded",
    data: { items: [], nextCursor: null },
  });
  loaders.loadProject.mockResolvedValue({
    status: "loaded",
    data: project("project-1", "Launch film"),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Desktop Start routes", () => {
  it("keeps titlebar and settings theme controls synchronized", async () => {
    renderRoute("/settings");
    await screen.findByRole("heading", { name: "Settings" });
    fireEvent.click(screen.getAllByRole("button", { name: "Light" })[1]!);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Dark" })).toHaveLength(2));
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getAllByRole("button", { name: "Dark" })[0]!);
    expect(screen.getAllByRole("button", { name: "Light" })).toHaveLength(2);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("keeps the theme after switching language and leaving settings", async () => {
    const router = renderRoute("/settings");
    await screen.findByRole("heading", { name: "Settings" });
    fireEvent.click(screen.getAllByRole("button", { name: "Light" })[1]!);
    fireEvent.click(screen.getByRole("button", { name: "简体中文" }));
    await screen.findByRole("heading", { name: messages.zh.settings.title });
    expect(useDesktopPreferences.getState().theme).toBe("light");
    await act(() => router.navigate({ to: "/projects" }));
    await act(() => router.navigate({ to: "/settings" }));
    expect(await screen.findByRole("heading", { name: messages.zh.settings.title })).toBeDefined();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("opens projects directly from the root URL", async () => {
    const router = renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeDefined();
    expect(router.state.location.pathname).toBe("/projects");
    const navigation = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(navigation).getAllByRole("link")).toHaveLength(2);
    expect(within(navigation).getByRole("link", { name: "Projects" })).toBeDefined();
    expect(within(navigation).getByRole("link", { name: "Settings" })).toBeDefined();
  });

  it("opens project details without rendering the project list over them", async () => {
    renderRoute("/projects/project-1");

    expect(await screen.findByRole("heading", { name: "Launch film" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Projects" })).toBeNull();
  });

  it("creates a project task and refreshes the detail route", async () => {
    renderRoute("/projects/project-1");
    await screen.findByRole("heading", { name: "Launch film" });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    const input = screen.getByRole("textbox", { name: "Add a task" });
    fireEvent.change(input, { target: { value: "Research sources" } });
    loaders.createTask.mockResolvedValue(undefined);
    loaders.loadProject.mockResolvedValue({
      status: "loaded",
      data: {
        ...project("project-1", "Launch film"),
        tasks: [{ id: "task-1", title: "Research sources", status: "todo" }],
      },
    });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText("Research sources")).toBeDefined();
    expect(loaders.createTask).toHaveBeenCalledWith("project-1", "Research sources");
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("keeps read-only project tasks visible without write controls", async () => {
    loaders.loadProject.mockResolvedValue({
      status: "loaded",
      data: {
        ...project("project-1", "Launch film"),
        access: "read",
        tasks: [{ id: "task-1", title: "Research sources", status: "todo" }],
      },
    });
    renderRoute("/projects/project-1");
    expect(await screen.findByText("Research sources")).toBeDefined();
    expect(screen.getByText(messages.en.projects.readOnly)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Add task" })).toBeNull();
  });

  it("renders a missing project through the route's not-found boundary", async () => {
    loaders.loadProject.mockResolvedValue({ status: "loaded", data: null });
    renderRoute("/projects/missing");
    expect(await screen.findByRole("heading", { name: "Project not found" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to projects" }).getAttribute("href")).toBe(
      "/projects",
    );
  });

  it("shows route pending UI until project data is ready", async () => {
    const router = renderRoute("/settings");
    await screen.findByText("Desktop user");
    const pending = deferred<{ status: "loaded"; data: { items: []; nextCursor: null } }>();
    loaders.loadProjects.mockReturnValue(pending.promise);
    act(() => {
      void router.navigate({ to: "/projects" });
    });
    expect((await screen.findByRole("status")).textContent).toBe(messages.en.common.loading);
    await act(async () =>
      pending.resolve({ status: "loaded", data: { items: [], nextCursor: null } }),
    );
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeDefined();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps an old project response from replacing a later navigation", async () => {
    const first = deferred<{ status: "loaded"; data: ReturnType<typeof project> }>();
    loaders.loadProject.mockImplementation((id: string) =>
      id === "first"
        ? first.promise
        : Promise.resolve({ status: "loaded", data: project("second", "Second project") }),
    );
    const router = renderRoute("/projects/first");
    await waitFor(() => expect(loaders.loadProject).toHaveBeenCalled());
    const firstSignal = loaders.loadProject.mock.calls[0]?.[1] as AbortSignal;

    await act(() =>
      router.navigate({ to: "/projects/$projectId", params: { projectId: "second" } }),
    );
    expect(await screen.findByRole("heading", { name: "Second project" })).toBeDefined();
    expect(firstSignal.aborted).toBe(true);
    await act(async () =>
      first.resolve({ status: "loaded", data: project("first", "First project") }),
    );
    expect(screen.queryByRole("heading", { name: "First project" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Second project" })).toBeDefined();
  });

  it("navigates cursor pages and restores the first page through browser history", async () => {
    loaders.loadProjects.mockImplementation((_signal: AbortSignal, query: { cursor?: string }) =>
      Promise.resolve({
        status: "loaded",
        data: {
          items: [
            project(query.cursor ? "second" : "first", query.cursor ? "Second page" : "First page"),
          ],
          nextCursor: query.cursor ? null : "next",
        },
      }),
    );
    const router = renderRoute("/projects");
    expect(await screen.findByRole("heading", { name: "First page" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByRole("heading", { name: "Second page" })).toBeDefined();
    expect(router.state.location.search).toEqual({ cursor: "next" });
    expect(loaders.loadProjects).toHaveBeenLastCalledWith(expect.any(AbortSignal), {
      cursor: "next",
    });
    await act(() => router.history.back());
    expect(await screen.findByRole("heading", { name: "First page" })).toBeDefined();
    expect(router.state.location.search).toEqual({});
  });

  it("reloads the project list after creation", async () => {
    renderRoute("/projects");
    await screen.findByRole("heading", { name: "Projects" });
    expect(loaders.loadProjects).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New film" } });
    loaders.createProject.mockResolvedValue(project("new", "New film"));
    loaders.loadProjects.mockResolvedValue({
      status: "loaded",
      data: { items: [project("new", "New film")], nextCursor: null },
    });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByRole("heading", { name: "New film" })).toBeDefined();
    expect(loaders.createProject).toHaveBeenCalledWith("New film");
    expect(loaders.loadProjects).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("retains the creation form and reports rejected writes", async () => {
    renderRoute("/projects");
    await screen.findByRole("heading", { name: "Projects" });
    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New film" } });
    loaders.createProject.mockRejectedValue(new Error("offline"));
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("alert")).toBeDefined();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("New film");
    expect(loaders.loadProjects).toHaveBeenCalledTimes(2);
  });

  it("recovers a route loader error when retried", async () => {
    loaders.loadProjects.mockRejectedValue(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    renderRoute("/projects");
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(loaders.loadProjects).toHaveBeenCalledTimes(2);
    loaders.loadProjects.mockResolvedValue({
      status: "loaded",
      data: { items: [], nextCursor: null },
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeDefined();
    expect(loaders.loadProjects).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("hides account-owned project data after sign-out while leaving settings available", async () => {
    const router = renderRoute("/projects/project-1");
    await screen.findByRole("heading", { name: "Launch film" });
    loaders.loadAccount.mockResolvedValue({ status: "signed_out" });
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(messages.en.common.signedOut),
    );
    expect(screen.queryByRole("heading", { name: "Launch film" })).toBeNull();
    await act(() => router.navigate({ to: "/settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeDefined();
  });

  it("disposes the old account view before loading another account's project", async () => {
    renderRoute("/projects/project-1");
    await screen.findByRole("heading", { name: "Launch film" });
    const next = deferred<{ status: "loaded"; data: ReturnType<typeof project> }>();
    loaders.loadAccount.mockResolvedValue({
      status: "signed_in",
      profile: { id: "user-2", email: "other@example.test", displayName: "Other user" },
    });
    loaders.loadProject.mockReturnValue(next.promise);
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(loaders.loadProject).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("heading", { name: "Launch film" })).toBeNull();
    await act(async () =>
      next.resolve({ status: "loaded", data: project("project-1", "Other account project") }),
    );
    expect(await screen.findByRole("heading", { name: "Other account project" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Launch film" })).toBeNull();
    expect(screen.getByText("Other user")).toBeDefined();
  });
});
