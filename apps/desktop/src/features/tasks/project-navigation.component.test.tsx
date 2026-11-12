/** @vitest-environment happy-dom */
import { BrowserLanguageProvider } from "../../i18n.js";
import { afterEach, beforeEach, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Sidebar, SidebarProvider } from "@raypx/ui/components/ui/sidebar";
import { ProjectNavigation } from "./project-navigation.js";
import { desktopFixture } from "../../../tests/helpers/desktop.js";
import { DesktopFixtureProvider } from "../../../tests/helpers/desktop-view.js";
import { useProjectCatalog } from "./project-catalog.js";

let fixture: ReturnType<typeof desktopFixture>;
const views: (() => void)[] = [];
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  fixture = desktopFixture();
  fixture.device.projects = Array.from({ length: 7 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
    name: `Project ${index}`,
    providers: ["codex" as const],
    dirty: false,
  }));
});
afterEach(() => {
  cleanup();
  for (const close of views.splice(0)) close();
});
function CatalogSummary() {
  const catalog = useProjectCatalog();
  return <output aria-label="Project count">{catalog.data?.[0]?.projects.length ?? 0}</output>;
}
async function navigation() {
  const history = createMemoryHistory({ initialEntries: ["/tasks"] });
  const root = createRootRoute({
    component: () => (
      <SidebarProvider>
        <Sidebar>
          <ProjectNavigation />
        </Sidebar>
        <CatalogSummary />
      </SidebarProvider>
    ),
  });
  const tree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: "/tasks", component: () => null }),
    createRoute({ getParentRoute: () => root, path: "/welcome", component: () => null }),
  ]);
  const router = createRouter({ routeTree: tree, history });
  await router.load();
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  views.push(() => {
    history.destroy();
    queries.clear();
  });
  const view = render(
    <QueryClientProvider client={queries}>
      <BrowserLanguageProvider>
        <DesktopFixtureProvider fixture={fixture}>
          <RouterProvider router={router} />
        </DesktopFixtureProvider>
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  return { history, queries, unmount: view.unmount };
}
it("limits shortcuts, searches all authorized projects and navigates to a local project filter", async () => {
  const { history } = await navigation();
  await screen.findByRole("link", { name: "Project 0" });
  expect(screen.queryByRole("link", { name: "Project 6" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "All projects" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search projects" }), {
    target: { value: "Project 6" },
  });
  fireEvent.click(await screen.findByRole("link", { name: "Project 6" }));
  await waitFor(() =>
    expect(history.location.search).toContain(`project=${fixture.device.projects[6]!.id}`),
  );
  expect(history.location.search).toContain("scope=local");
  expect(JSON.parse(localStorage.getItem("raypx.recent-projects.v1")!)[0]).toBe(
    fixture.device.projects[6]!.id,
  );
  expect(fixture.calls.some((call) => call.method === "agents.local.device")).toBe(true);
});
it("offers local setup when there are no authorized projects", async () => {
  fixture.device.projects = [];
  await navigation();
  expect(
    (await screen.findByRole("link", { name: "Authorize your first project" })).getAttribute(
      "href",
    ),
  ).toBe("/welcome");
});

it("keeps remaining shortcuts visible when an expanded project list shrinks", async () => {
  const { queries } = await navigation();
  fireEvent.click(await screen.findByRole("button", { name: "All projects" }));
  fixture.device.projects = [
    {
      id: fixture.device.projects[0]!.id,
      name: "Remaining project",
      providers: ["codex"],
      dirty: false,
    },
  ];
  await act(async () => {
    await queries.invalidateQueries({ queryKey: ["desktop-project-navigation"] });
  });
  await screen.findByRole("link", { name: "Remaining project" });
  expect(screen.queryByRole("button", { name: "All projects" })).toBeNull();
});

it("shares one catalog read across consumers and releases event subscriptions on unmount", async () => {
  const { unmount, queries } = await navigation();
  await screen.findByRole("link", { name: "Project 0" });
  expect(screen.getByRole("status", { name: "Project count" }).textContent).toBe("7");
  expect(fixture.calls.filter((call) => call.method === "agents.local.device")).toHaveLength(1);
  fixture.setLocal("agents.local.device", () => {
    throw new Error("Disconnected");
  });
  await act(async () =>
    fixture.emit({ version: 1, event: "engine.status", data: { status: "error" } }),
  );
  await waitFor(() =>
    expect(queries.getQueryState(["desktop-project-navigation"])?.status).toBe("error"),
  );
  expect(screen.getByRole("link", { name: "Project 0" })).toBeTruthy();
  fixture.setLocal("agents.local.device", () => fixture.device);
  fixture.device.projects = [];
  await act(async () =>
    fixture.emit({
      version: 1,
      event: "agent.changed",
      data: { change: { type: "devices" } },
    }),
  );
  await screen.findByRole("link", { name: "Authorize your first project" });
  expect(screen.getByRole("status", { name: "Project count" }).textContent).toBe("0");
  expect(fixture.calls.filter((call) => call.method === "agents.local.device")).toHaveLength(3);
  unmount();
  await act(async () =>
    fixture.emit({ version: 1, event: "engine.status", data: { status: "ready" } }),
  );
  expect(fixture.calls.filter((call) => call.method === "agents.local.device")).toHaveLength(3);
});
