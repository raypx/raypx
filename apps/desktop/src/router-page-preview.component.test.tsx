vi.mock("./features/auth/sign-out.js", () => ({
  useDesktopSignOut: () => ({ suppressSessionRedirect: false, sessionEnded: vi.fn() }),
}));
import type { AgentsWorkspaceProps } from "@raypx/agents/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pageVersionSchema } from "@raypx/core/pages";
import { BrowserLanguageProvider } from "./i18n.js";

const mocks = vi.hoisted(() => ({
  native: false,
  getBridge: vi.fn(),
  openExternal: vi.fn(async () => true),
  pages: { list: vi.fn(), get: vi.fn() },
}));
vi.mock("./features/auth/client.js", () => ({
  apiUrl: "https://api.example.test",
  webUrl: "https://web.example.test",
  authClient: {
    useSession: () => ({ data: { user: { id: "account" } }, isPending: false, error: null }),
  },
}));
vi.mock("./features/agents/client.js", () => ({ agentsClient: { pages: mocks.pages } }));
vi.mock("./features/agents/socket.js", () => ({
  desktopConversationSocket: () => ({ connect: vi.fn() }),
}));
vi.mock("./lib/desktop.js", () => ({
  isDesktop: () => mocks.native,
  getBridge: mocks.getBridge,
  pairDeviceConnector: vi.fn(async () => true),
  grantDeviceDirectory: vi.fn(async () => true),
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
import { Route } from "./routes/pages.js";

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
const histories: ReturnType<typeof createMemoryHistory>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.pages.list.mockResolvedValue([page]);
  mocks.pages.get.mockResolvedValue(page);
  mocks.getBridge.mockResolvedValue({ request: { openExternal: mocks.openExternal } });
});
afterEach(() => {
  cleanup();
  for (const history of histories.splice(0)) history.destroy();
  vi.restoreAllMocks();
});
async function mount() {
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
}
const webPageUrl = "https://web.example.test/pages?spaceId=team-one&pageId=page-one";
it.each([
  { native: false, nativeCalls: [], browserCalls: [[webPageUrl, "_blank", "noopener,noreferrer"]] },
  { native: true, nativeCalls: [[{ url: webPageUrl }]], browserCalls: [] },
])(
  "disables frames and opens the configured Web Page with native host $native",
  async ({ native, nativeCalls, browserCalls }) => {
    mocks.native = native;
    const openWindow = vi.spyOn(window, "open").mockReturnValue(null);
    await mount();
    const handoff = await screen.findByRole("button", { name: "Open in Web" });
    expect(screen.getByText("Open this page in Web to preview it.")).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
    fireEvent.click(handoff);
    await waitFor(() => expect(mocks.openExternal.mock.calls).toEqual(nativeCalls));
    expect(openWindow.mock.calls).toEqual(browserCalls);
    expect(mocks.getBridge).toHaveBeenCalledTimes(nativeCalls.length);
    expect(document.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit source" }));
    const source = await screen.findByRole("textbox", { name: "Source" });
    expect((source as HTMLTextAreaElement).value).toBe("Page source");
  },
);
