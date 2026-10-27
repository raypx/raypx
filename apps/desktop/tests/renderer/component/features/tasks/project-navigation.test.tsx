/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
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
import { Sidebar, SidebarProvider } from "@raypx/ui/components/ui/sidebar";
import { ProjectNavigation } from "../../../../../src/features/tasks/project-navigation";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../../../../../src/features/tasks/local-client", () => ({
  localTaskClient: { devices: { list: mocks.list } },
}));
vi.mock("../../../../../src/lib/desktop", () => ({
  isDesktop: () => true,
  onLocalEvent: () => () => {},
}));
const histories: ReturnType<typeof createMemoryHistory>[] = [];
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  mocks.list.mockReset().mockResolvedValue([
    {
      projects: Array.from({ length: 7 }, (_, index) => ({
        id: `project-${index}`,
        name: `Project ${index}`,
        providers: ["codex"],
        dirty: false,
      })),
    },
  ]);
});
afterEach(() => {
  cleanup();
  for (const history of histories.splice(0)) history.destroy();
});
async function navigation() {
  const history = createMemoryHistory({ initialEntries: ["/tasks"] });
  histories.push(history);
  const root = createRootRoute({
    component: () => (
      <SidebarProvider>
        <Sidebar>
          <ProjectNavigation />
        </Sidebar>
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
  render(
    <QueryClientProvider client={queries}>
      <BrowserLanguageProvider>
        <RouterProvider router={router} />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  return { history, queries };
}
it("limits shortcuts, searches all authorized projects and navigates to a local project filter", async () => {
  const { history } = await navigation();
  await screen.findByRole("link", { name: "Project 0" });
  expect(screen.queryByRole("link", { name: "Project 6" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "All projects" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), {
    target: { value: "Project 6" },
  });
  fireEvent.click(await screen.findByRole("link", { name: "Project 6" }));
  await waitFor(() => expect(history.location.search).toContain("project=project-6"));
  expect(history.location.search).toContain("scope=local");
  expect(JSON.parse(localStorage.getItem("raypx.recent-projects.v1")!)[0]).toBe("project-6");
  expect(mocks.list).toHaveBeenCalled();
});
it("offers local setup when there are no authorized projects", async () => {
  mocks.list.mockResolvedValue([{ projects: [] }]);
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
  mocks.list.mockResolvedValue([
    {
      projects: [
        { id: "remaining", name: "Remaining project", providers: ["codex"], dirty: false },
      ],
    },
  ]);
  await act(async () => {
    await queries.invalidateQueries({ queryKey: ["desktop-project-navigation"] });
  });
  await screen.findByRole("link", { name: "Remaining project" });
  expect(screen.queryByRole("button", { name: "All projects" })).toBeNull();
});
