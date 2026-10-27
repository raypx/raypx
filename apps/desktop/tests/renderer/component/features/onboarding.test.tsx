/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
expect.extend(matchers);
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import type { DeviceProject, AgentCapability } from "@raypx/contracts/tasks";
const mocks = vi.hoisted(() => ({ request: vi.fn(), pick: vi.fn() }));
vi.mock("../../../../src/lib/desktop", () => ({
  isDesktop: () => true,
  localRequest: mocks.request,
  pickDirectory: mocks.pick,
}));
import { LocalWelcome } from "../../../../src/features/onboarding/welcome";
let projects: DeviceProject[], available: boolean;
beforeEach(() => {
  projects = [];
  available = false;
  localStorage.setItem("raypx_locale", "en");
  mocks.pick.mockResolvedValue({ id: "root-one", name: "My project" });
  mocks.request.mockImplementation(async (method, params) => {
    if (method === "agents.projects") return projects;
    if (method === "agents.capabilities")
      return [
        {
          provider: "codex",
          available,
          reason: available ? "ready" : "missing",
          version: "test",
          inputModes: [],
        } satisfies AgentCapability,
      ];
    if (method === "agents.configure") {
      projects = [
        { id: params.rootId, name: "My project", providers: ["claude", "codex"], dirty: false },
      ];
      return projects;
    }
    throw new Error("Unexpected operation");
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
async function page() {
  const root = createRootRoute({ component: Outlet });
  const index = createRoute({ getParentRoute: () => root, path: "/", component: LocalWelcome });
  const tasks = createRoute({
    getParentRoute: () => root,
    path: "/tasks",
    component: () => <p>Task editor</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([index, tasks]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrowserLanguageProvider>
        <RouterProvider router={router} />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  return router;
}
it("authorizes a project and checks a provider before opening the editor, without starting work", async () => {
  const router = await page();
  await screen.findByText("Codex");
  expect(screen.getByRole("button", { name: "Write a local task" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Authorize a project folder" }));
  await screen.findByText("My project");
  expect(mocks.request).toHaveBeenCalledWith("agents.configure", {
    rootId: "root-one",
    providers: ["claude", "codex"],
  });
  expect(screen.getByRole("button", { name: "Write a local task" })).toBeDisabled();
  available = true;
  fireEvent.click(screen.getByRole("button", { name: "Check agents again" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Write a local task" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Write a local task" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/tasks"));
  expect(
    mocks.request.mock.calls.every(([method]) =>
      ["agents.projects", "agents.capabilities", "agents.configure"].includes(method),
    ),
  ).toBe(true);
});
it("keeps setup recoverable when the picker is cancelled or authorization fails", async () => {
  mocks.pick.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("private directory"));
  await page();
  fireEvent.click(screen.getByRole("button", { name: "Authorize a project folder" }));
  await waitFor(() => expect(mocks.pick).toHaveBeenCalledTimes(1));
  expect(mocks.request.mock.calls.some(([method]) => method === "agents.configure")).toBe(false);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Authorize a project folder" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Authorize a project folder" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("private directory")).toBeNull();
  expect(screen.getByRole("button", { name: "Authorize a project folder" })).toBeEnabled();
});
