/** @vitest-environment happy-dom */
import { afterEach, expect, it } from "vite-plus/test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { desktopFixture } from "../../../tests/helpers/desktop.ts";
import { DesktopFixtureProvider } from "../../../tests/helpers/desktop-view.tsx";
import { EngineGate } from "./gate.tsx";
import { EngineRouteSync } from "./routes.tsx";

const views: (() => void)[] = [];
afterEach(() => {
  cleanup();
  for (const close of views.splice(0)) close();
});
it("recovers local loaders that failed before the gated layout mounted", async () => {
  localStorage.setItem("raypx_locale", "en");
  const fixture = desktopFixture();
  fixture.runtime.engine = { status: "error" };
  fixture.setNative("restartEngine", async () => {
    fixture.runtime.engine = { status: "ready" };
    return true;
  });
  let reads = 0;
  const root = createRootRoute({
    component: () => (
      <>
        <EngineRouteSync />
        <EngineGate>
          <Outlet />
        </EngineGate>
      </>
    ),
  });
  const local = createRoute({
    getParentRoute: () => root,
    id: "(local)",
    loader: () => {
      reads++;
      return { roots: fixture.runtime.engine.status === "ready" ? [] : null };
    },
    component: () => {
      const { roots } = local.useLoaderData();
      return (
        <>
          <p>{roots ? "Restored folder" : "Unavailable folder"}</p>
          <input aria-label="Draft" defaultValue="Keep this draft" />
        </>
      );
    },
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createRouter({
    routeTree: root.addChildren([
      local.addChildren([
        createRoute({ getParentRoute: () => local, path: "/", component: () => null }),
      ]),
    ]),
    history,
  });
  await router.load();
  expect(reads).toBe(1);
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  expect(screen.queryByText("Unavailable folder")).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "Restart local tools" }));
  await screen.findByText("Restored folder");
  expect(reads).toBe(2);
  const draft = screen.getByRole("textbox", { name: "Draft" });
  await act(async () =>
    fixture.emit({ version: 1, event: "engine.status", data: { status: "error" } }),
  );
  expect(screen.getByRole("textbox", { name: "Draft" })).toBe(draft);
  await act(async () =>
    fixture.emit({ version: 1, event: "engine.status", data: { status: "ready" } }),
  );
  await waitFor(() => expect(reads).toBe(3));
  expect(screen.getByRole("textbox", { name: "Draft" })).toBe(draft);
});
