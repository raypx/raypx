/** @vitest-environment happy-dom */
import { BrowserLanguageProvider } from "../../i18n.js";
import {
  createHashHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SettingsOverlay } from "./overlay.js";
import { useSettingsNavigation } from "./navigation.js";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  settingsMount: vi.fn(),
  settingsUnmount: vi.fn(),
  backgroundMount: vi.fn(),
  backgroundUnmount: vi.fn(),
}));
vi.mock("./content.js", async () => {
  const { useEffect: onMount } = await import("react");
  mocks.load();
  return {
    default: function SettingsContent() {
      onMount(() => {
        mocks.settingsMount();
        return () => mocks.settingsUnmount();
      }, []);
      return <input aria-label="Settings preference" />;
    },
  };
});
expect.extend(matchers);

const disposers: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
  vi.restoreAllMocks();
});

function Shell() {
  const { open } = useSettingsNavigation();
  return (
    <>
      <button type="button" onClick={() => void open()}>
        Open settings
      </button>
      <Outlet />
      <SettingsOverlay />
    </>
  );
}
function Background() {
  useEffect(() => {
    mocks.backgroundMount();
    return () => mocks.backgroundUnmount();
  }, []);
  return <input aria-label="Background draft" />;
}
async function page(
  history = createMemoryHistory({
    initialEntries: ["/agents?spaceId=work&agentId=notes#selected"],
  }),
) {
  const root = createRootRoute({ component: Shell });
  const router = createRouter({
    history,
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/agents", component: Background }),
      createRoute({
        getParentRoute: () => root,
        path: "/memory",
        component: () => <p>Memory background</p>,
      }),
      createRoute({ getParentRoute: () => root, path: "/prior-page", component: () => null }),
    ]),
  });
  disposers.push(() => router.history.destroy());
  await router.load();
  render(
    <BrowserLanguageProvider>
      <RouterProvider router={router} />
    </BrowserLanguageProvider>,
  );
  return router;
}

it("loads settings on demand while preserving the background draft, path and search", async () => {
  const router = await page();
  const background = screen.getByRole("textbox", { name: "Background draft" });
  fireEvent.change(background, { target: { value: "Unsaved local work" } });
  expect(mocks.load).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
  expect(await screen.findByRole("dialog", { name: "Settings" })).toBeVisible();
  expect(await screen.findByRole("textbox", { name: "Settings preference" })).toBeVisible();
  expect(router.state.location.href).toBe("/agents?spaceId=work&agentId=notes#settings");
  expect(background).toBeInTheDocument();
  expect(background).toHaveValue("Unsaved local work");
  expect(mocks.backgroundMount).toHaveBeenCalledTimes(1);
  expect(mocks.backgroundUnmount).not.toHaveBeenCalled();
  expect(mocks.settingsMount).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(router.state.location.hash).toBe("selected");
  expect(screen.getByRole("textbox", { name: "Background draft" })).toBe(background);
  expect(background).toHaveValue("Unsaved local work");
  expect(mocks.settingsUnmount).toHaveBeenCalledTimes(1);
});

it("uses browser back and forward to close and reopen the overlay without remounting the page", async () => {
  const router = await page();
  const background = screen.getByRole("textbox", { name: "Background draft" });
  await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
  await screen.findByRole("dialog", { name: "Settings" });
  router.history.back();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(router.state.location.hash).toBe("selected");
  router.history.forward();
  expect(await screen.findByRole("dialog", { name: "Settings" })).toBeVisible();
  expect(background).toBeInTheDocument();
  expect(mocks.backgroundMount).toHaveBeenCalledTimes(1);
  expect(mocks.backgroundUnmount).not.toHaveBeenCalled();
});

it("closes a direct or refreshed settings URL in place instead of returning to the previous page", async () => {
  const router = await page(
    createMemoryHistory({ initialEntries: ["/prior-page", "/agents?spaceId=work#settings"] }),
  );
  await screen.findByRole("dialog", { name: "Settings" });
  const index = router.state.location.state.__TSR_index;
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(router.state.location.href).toBe("/agents?spaceId=work");
  expect(router.state.location.state.__TSR_index).toBe(index);
  expect(router.history.length).toBe(2);
});

it.each(["Escape", "Close"])(
  "returns focus to the opener when dismissed with %s",
  async (method) => {
    await page();
    const opener = screen.getByRole("button", { name: "Open settings" });
    await userEvent.click(opener);
    await screen.findByRole("textbox", { name: "Settings preference" });
    if (method === "Escape") await userEvent.keyboard("{Escape}");
    else await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  },
);

it("does not return to a stale background after the current page changes", async () => {
  const router = await page();
  await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
  await screen.findByRole("dialog", { name: "Settings" });
  await router.navigate({
    href: "/memory?scope=local#settings",
    replace: true,
    state: (previous) => previous,
  });
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(router.state.location.href).toBe("/memory?scope=local");
  expect(router.state.location.state.desktopSettingsBackground).toBeUndefined();
  expect(screen.getByText("Memory background")).toBeVisible();
});

it("opens only the exact settings fragment", async () => {
  await page(createMemoryHistory({ initialEntries: ["/agents#settings/appearance"] }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Settings preference" })).not.toBeInTheDocument();
});

it("preserves the packaged MyGo route and search when closing a settings deep link", async () => {
  const search = new URLSearchParams({ spaceId: "work", agentId: "src/设计 & notes" });
  window.history.replaceState({}, "", `/index.html#/agents?${search}#settings`);
  try {
    const router = await page(createHashHistory());
    await screen.findByRole("dialog", { name: "Settings" });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/agents");
    expect(router.state.location.search).toMatchObject({
      spaceId: "work",
      agentId: "src/设计 & notes",
    });
    expect(window.location.pathname).toBe("/index.html");
    expect(window.location.hash).toMatch(/^#\/agents\?/);
    expect(window.location.hash).not.toContain("#settings");
  } finally {
    window.history.replaceState({}, "", "/");
  }
});
