import type { ReactNode } from "react";
import type { AgentsWorkspaceProps } from "@raypx/agents/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { pageVersionSchema } from "@raypx/core/pages";
import { BrowserLanguageProvider } from "./i18n.js";

const mocks = vi.hoisted(() => ({ pages: { list: vi.fn(), get: vi.fn() } }));
vi.mock("./features/auth/client.js", () => ({ apiUrl: "https://api.example.test" }));
vi.mock("./features/agents/client.js", () => ({ agentsClient: { pages: mocks.pages } }));
vi.mock("./features/auth/components/session-boundary.js", () => ({
  SessionBoundary: ({ children }: { children: (accountId: string) => ReactNode }) =>
    children("account"),
}));
vi.mock("./features/auth/route-guard.js", () => ({
  webPageGuard: () => undefined,
  PageAccessFeedback: () => null,
}));
vi.mock("@raypx/agents/client", () => ({
  AgentsWorkspace: ({ renderWorkspace }: AgentsWorkspaceProps) =>
    renderWorkspace?.({
      spaceId: "team-one",
      agents: [],
      accountNames: {},
      subscribe: () => () => {},
    }),
}));
import { Route } from "./routes/(app)/pages.js";

const histories: ReturnType<typeof createMemoryHistory>[] = [];
afterEach(() => {
  cleanup();
  for (const history of histories.splice(0)) history.destroy();
});
it("enables only the sandboxed authenticated document route in Web", async () => {
  const page = pageVersionSchema.parse({
    id: "page-one",
    spaceId: "team-one",
    agentId: null,
    title: "Notes",
    kind: "document",
    version: 1,
    body: "Page source",
    reason: "created",
    author: { kind: "member", accountId: "account", runId: null },
    createdAt: "2026-11-14T00:00:00.000Z",
    updatedAt: "2026-11-14T00:00:00.000Z",
  });
  mocks.pages.list.mockResolvedValue([page]);
  mocks.pages.get.mockResolvedValue(page);
  const root = createRootRoute();
  const history = createMemoryHistory({
    initialEntries: ["/pages?spaceId=team-one&pageId=page-one"],
  });
  histories.push(history);
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: "/pages",
        component: Route.options.component!,
        validateSearch: Route.options.validateSearch,
      }),
    ]),
    history,
  });
  await router.load();
  await act(async () =>
    render(
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <RouterProvider router={router} />
      </BrowserLanguageProvider>,
    ),
  );
  const frame = await screen.findByTitle("Notes");
  expect(frame.getAttribute("src")).toBe(
    "https://api.example.test/page-content/member/team-one/page-one?version=1",
  );
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  expect(frame.hasAttribute("srcdoc")).toBe(false);
  expect(screen.queryByRole("button", { name: "Open in Web" })).toBeNull();
});
