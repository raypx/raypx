/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "../../../i18n.js";
import { DesktopPlatformProvider } from "../../../lib/platform-context.js";
import { DesktopRuntimeProvider } from "../../engine/provider.js";
import { DesktopSignOutProvider } from "../sign-out.js";
import { desktopFixture } from "../../../../tests/helpers/desktop.js";
import { SessionGate } from "./session-gate.js";

expect.extend(matchers);

vi.mock("../client.js", () => ({
  apiUrl: "https://api.example.test",
  webUrl: "https://app.example.test",
  authClient: {
    useSession: () => ({
      data: { user: { id: "new-member", name: "New member", email: "member@example.test" } },
      error: null,
      isPending: false,
    }),
    signOut: vi.fn(),
  },
}));
vi.mock("../../analytics/client.js", () => ({ analytics: { reset: vi.fn() } }));
const close: (() => void)[] = [];
afterEach(() => {
  cleanup();
  for (const dispose of close.splice(0)) dispose();
});

it("admits a signed-in server workspace without retained device enrollment", async () => {
  const fixture = desktopFixture();
  fixture.setLocal("instance.status", () => ({ state: "unregistered" }));
  fixture.setLocal("instance.refresh", () => ({ state: "unregistered" }));
  const root = createRootRoute({
    component: () => (
      <DesktopSignOutProvider>
        <SessionGate>
          <h1>Agents and Devices</h1>
        </SessionGate>
      </DesktopSignOutProvider>
    ),
  });
  const history = createMemoryHistory({ initialEntries: ["/agents"] });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/agents", component: () => null }),
    ]),
    history,
  });
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  close.push(() => {
    history.destroy();
    queries.clear();
  });
  await router.load();
  render(
    <QueryClientProvider client={queries}>
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <DesktopPlatformProvider platform={fixture.platform}>
          <DesktopRuntimeProvider>
            <RouterProvider router={router} />
          </DesktopRuntimeProvider>
        </DesktopPlatformProvider>
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("heading", { name: "Agents and Devices" })).toBeInTheDocument();
  expect(fixture.calls.some(({ method }) => method.startsWith("instance."))).toBe(false);
});
