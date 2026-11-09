/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { desktopFixture, deferred } from "../../../tests/helpers/desktop.ts";
import { DesktopFixtureProvider } from "../../../tests/helpers/desktop-view.tsx";
import { EngineGate } from "../engine/gate.tsx";
import { LocalWelcome } from "./welcome.tsx";
import { LocalHome } from "./home.tsx";
import type { ReactNode } from "react";

const views: (() => void)[] = [];
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => {
  cleanup();
  for (const close of views.splice(0)) close();
});
async function mount(
  fixture: ReturnType<typeof desktopFixture>,
  element: ReactNode,
  path = "/welcome",
) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const root = createRootRoute({ component: () => element });
  const router = createRouter({
    routeTree: root.addChildren(
      ["/", "/welcome", "/tasks"].map((routePath) =>
        createRoute({ getParentRoute: () => root, path: routePath, component: () => null }),
      ),
    ),
    history,
  });
  await router.load();
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  views.push(() => {
    history.destroy();
    queries.clear();
  });
  render(
    <QueryClientProvider client={queries}>
      <BrowserLanguageProvider>
        <DesktopFixtureProvider fixture={fixture}>
          <RouterProvider router={router} />
        </DesktopFixtureProvider>
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  return { history, queries };
}
function readyProject(fixture: ReturnType<typeof desktopFixture>) {
  const project = {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Authorized project",
    providers: ["codex" as const],
    dirty: false,
  };
  fixture.device.projects = [project];
  fixture.device.capabilities = [
    {
      provider: "codex",
      available: true,
      version: "test",
      reason: "ready",
      definition: {
        version: 1,
        runtime: "process",
        modes: ["run", "plan"],
        approvals: true,
        modelSelection: false,
      },
      inputModes: ["steer", "queue"],
    },
  ];
  return project;
}

it("waits for the first engine connection, recovers, and keeps the mounted workspace on later outages", async () => {
  const fixture = desktopFixture();
  fixture.runtime.engine = { status: "error" };
  fixture.setNative("restartEngine", async () => {
    fixture.runtime.engine = { status: "ready" };
    return true;
  });
  await mount(
    fixture,
    <EngineGate>
      <label>
        Draft
        <input defaultValue="Keep my text" />
      </label>
    </EngineGate>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Restart local tools" }));
  const draft = await screen.findByRole("textbox", { name: "Draft" });
  await act(async () =>
    fixture.emit({ version: 1, event: "engine.status", data: { status: "error" } }),
  );
  expect(screen.getByRole("textbox", { name: "Draft" })).toBe(draft);
  expect((draft as HTMLInputElement).value).toBe("Keep my text");
});

it("waits for startup without requesting projects or providers", async () => {
  const fixture = desktopFixture(),
    pending = deferred<typeof fixture.runtime>();
  fixture.setNative("getRuntime", () => pending.promise);
  await mount(
    fixture,
    <EngineGate>
      <LocalWelcome />
    </EngineGate>,
  );
  expect(screen.getByRole("status", { name: "Loading…" })).toBeTruthy();
  expect(fixture.calls.some((call) => call.method === "agents.local.device")).toBe(false);
  pending.resolve(fixture.runtime);
  await screen.findByRole("button", { name: "Authorize a project folder" });
});

it("keeps directory-picker cancellation quiet and performs no configuration write", async () => {
  const fixture = desktopFixture();
  await mount(fixture, <LocalWelcome />);
  const choose = await screen.findByRole("button", { name: "Authorize a project folder" });
  await waitFor(() => expect((choose as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(choose);
  await waitFor(() =>
    expect(fixture.calls.some((call) => call.method === "pickDirectory")).toBe(true),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(fixture.calls.some((call) => call.method === "agents.configure")).toBe(false);
});

it("authorizes a project and checks a provider before opening the editor without starting work", async () => {
  const fixture = desktopFixture(),
    project = readyProject(fixture);
  fixture.device.projects = [];
  fixture.setLocal("agents.capabilities", () =>
    fixture.device.capabilities.map((agent) => ({ ...agent, available: false, reason: "missing" })),
  );
  fixture.setNative("pickDirectory", async () => ({
    id: project.id,
    name: project.name,
    path: "/authorized-project",
    createdAt: "2026-11-04T00:00:00.000Z",
  }));
  fixture.setLocal("agents.configure", () => {
    fixture.device.projects = [project];
    return { configured: true };
  });
  const { history } = await mount(fixture, <LocalHome />, "/");
  await screen.findByText("Codex");
  expect(screen.getByRole("button", { name: "Write a message" }).hasAttribute("disabled")).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Authorize a project folder" }));
  await screen.findByText(project.name);
  expect(history.location.pathname).toBe("/");
  expect(fixture.calls.find((call) => call.method === "agents.configure")?.input).toEqual({
    rootId: project.id,
    providers: ["claude", "codex", "pi"],
  });
  expect(screen.getByRole("button", { name: "Write a message" }).hasAttribute("disabled")).toBe(
    true,
  );
  fixture.setLocal("agents.capabilities", () => fixture.device.capabilities);
  fireEvent.click(screen.getByRole("button", { name: "Check agents again" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Write a message" }).hasAttribute("disabled")).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Write a message" }));
  await waitFor(() => expect(history.location.pathname).toBe("/tasks"));
  expect(history.location.search).toContain(project.id);
  expect(history.location.search).toContain(fixture.device.id);
  expect(fixture.calls.some((call) => call.method === "agents.local.execute")).toBe(false);
});

it("allows retry after a directory authorization failure without showing native error content", async () => {
  const fixture = desktopFixture();
  fixture.setNative("pickDirectory", async () => {
    throw new Error("private directory");
  });
  await mount(fixture, <LocalWelcome />);
  const choose = await screen.findByRole("button", { name: "Authorize a project folder" });
  await waitFor(() => expect(choose.hasAttribute("disabled")).toBe(false));
  fireEvent.click(choose);
  await screen.findByRole("alert");
  expect(screen.queryByText("private directory")).toBeNull();
  expect(choose.hasAttribute("disabled")).toBe(false);
  expect(fixture.calls.some((call) => call.method === "agents.configure")).toBe(false);
});

it("preserves projects when provider discovery fails and retries only that read", async () => {
  const fixture = desktopFixture();
  readyProject(fixture);
  fixture.setLocal("agents.capabilities", () => {
    throw new Error("Provider unavailable");
  });
  await mount(fixture, <LocalWelcome />);
  await screen.findByText("Authorized project");
  await screen.findByText("Agent status is unavailable. Check again to retry.");
  expect(screen.getByRole("button", { name: "Write a message" }).hasAttribute("disabled")).toBe(
    true,
  );
  fixture.setLocal("agents.capabilities", () => fixture.device.capabilities);
  fireEvent.click(screen.getByRole("button", { name: "Check agents again" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Write a message" }).hasAttribute("disabled")).toBe(
      false,
    ),
  );
  expect(fixture.calls.filter((call) => call.method === "agents.local.device")).toHaveLength(1);
  expect(fixture.calls.some((call) => call.method === "agents.local.execute")).toBe(false);
});

it.each(["", "#settings"])(
  "restores an authorized project without executing a task (%s)",
  async (hash) => {
    const fixture = desktopFixture(),
      project = readyProject(fixture);
    const { history } = await mount(fixture, <LocalHome />, `/${hash}`);
    await waitFor(() => expect(history.location.search).toContain(project.id));
    expect(history.location.pathname).toBe("/tasks");
    expect(history.location.hash).toBe(hash);
    expect(fixture.calls.some((call) => call.method === "agents.local.execute")).toBe(false);
  },
);

it("keeps an explicit invalid project selected until the person chooses another", async () => {
  const fixture = desktopFixture();
  readyProject(fixture);
  const target = "00000000-0000-4000-8000-000000000099";
  const { history } = await mount(fixture, <LocalHome />, `/?project=${target}`);
  await screen.findByText("This project is no longer available on this computer.");
  expect(history.location.search).toContain(target);
  expect(screen.getByRole("button", { name: "Choose a project" })).toBeTruthy();
  expect(fixture.calls.some((call) => call.method === "agents.local.execute")).toBe(false);
});
