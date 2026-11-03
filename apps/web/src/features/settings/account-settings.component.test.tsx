import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useEffect } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { ThemeProvider } from "@raypx/ui/themes";
import { AccountSettingsContent, AccountSettingsPanel } from "./account-settings";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});

async function openPanel(returnTo?: string) {
  const mounted = vi.fn();
  function PrivateSessions() {
    useEffect(() => {
      mounted();
    }, []);
    return <p>Session controls</p>;
  }
  const root = createRootRoute();
  const account = createRoute({
    getParentRoute: () => root,
    path: "/account",
    component: () => (
      <AccountSettingsPanel>
        <AccountSettingsContent value="account">
          <label>
            Draft name
            <input aria-label="Draft name" defaultValue="Ada" />
          </label>
        </AccountSettingsContent>
        <AccountSettingsContent value="password">Password controls</AccountSettingsContent>
        <AccountSettingsContent value="sessions">
          <PrivateSessions />
        </AccountSettingsContent>
        <AccountSettingsContent value="instances">Instance controls</AccountSettingsContent>
      </AccountSettingsPanel>
    ),
  });
  const projects = createRoute({
    getParentRoute: () => root,
    path: "/projects",
    component: () => <p>Project list</p>,
  });
  const tasks = createRoute({
    getParentRoute: () => root,
    path: "/tasks",
    component: () => <p>Task list</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([account, projects, tasks]),
    history: createMemoryHistory({ initialEntries: ["/account"] }),
  });
  await router.load();
  if (returnTo)
    await router.navigate({ to: "/account", state: { settingsReturnTo: returnTo }, replace: true });
  render(
    <ThemeProvider>
      <BrowserLanguageProvider>
        <RouterProvider router={router} />
      </BrowserLanguageProvider>
    </ThemeProvider>,
  );
  expect(await screen.findByRole("dialog")).toBeTruthy();
  return { router, mounted };
}

it("opens a direct link, preserves drafts and closes to projects", async () => {
  const { router } = await openPanel();
  fireEvent.change(screen.getByRole("textbox", { name: "Draft name" }), {
    target: { value: "Ada edited" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Change password" }));
  expect(screen.getByRole("tabpanel").textContent).toBe("Password controls");
  fireEvent.click(screen.getByRole("tab", { name: "Account" }));
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Draft name" }).value).toBe(
    "Ada edited",
  );
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
  expect(await screen.findByText("Project list")).toBeTruthy();
});

it("mounts private panels only on first visit and retains them after switching", async () => {
  const { mounted } = await openPanel();
  expect(mounted).not.toHaveBeenCalled();
  expect(screen.queryByText("Session controls")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Signed-in sessions" }));
  expect(mounted).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("tab", { name: "Account" }));
  fireEvent.click(screen.getByRole("tab", { name: "Signed-in sessions" }));
  expect(mounted).toHaveBeenCalledTimes(1);
});

it("changes device preferences within the dialog through the compact category selector", async () => {
  const { router } = await openPanel();
  fireEvent.click(screen.getByRole("combobox", { name: "Settings" }));
  const option = await screen.findByRole("option", { name: "Device preferences" });
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
  fireEvent.click(await screen.findByRole("radio", { name: "Dark" }));
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(router.state.location.pathname).toBe("/account");
});

it.each(["close", "escape"])("returns to the originating task and query on %s", async (action) => {
  const { router } = await openPanel("/tasks?taskId=task-123");
  if (action === "close") fireEvent.click(screen.getByRole("button", { name: "Close" }));
  else fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(router.state.location.href).toBe("/tasks?taskId=task-123"));
});

it.each(["https://untrusted.example/account", "/account?section=password", "/settings"])(
  "falls back to projects for %s",
  async (returnTo) => {
    const { router } = await openPanel(returnTo);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
  },
);

it.each([
  ["语言", "Device preferences"],
  ["  ＴＨＥＭＥ  ", "Device preferences"],
  ["display NAME", "Account"],
  ["注册码", "Registered instances"],
])("finds settings for %s without opening a category until selected", async (query, category) => {
  const { mounted } = await openPanel();
  const search = screen.getByRole<HTMLInputElement>("searchbox", { name: "Search settings" });
  fireEvent.change(search, { target: { value: query } });
  const results = screen.getByRole("navigation", { name: "Matching settings" });
  expect(within(results).getAllByRole("button")).toHaveLength(1);
  expect(mounted).not.toHaveBeenCalled();
  expect(screen.getByRole("tabpanel").textContent).toContain("Draft name");
  fireEvent.click(within(results).getByRole("button", { name: category }));
  expect(screen.getByRole("tab", { name: category }).getAttribute("aria-selected")).toBe("true");
  expect(search.value).toBe("");
  expect(document.activeElement).toBe(search);
});

it("shows an empty result without changing the current draft and restores categories on clear", async () => {
  await openPanel();
  const draft = screen.getByRole<HTMLInputElement>("textbox", { name: "Draft name" });
  fireEvent.change(draft, { target: { value: "Unsaved name" } });
  const search = screen.getByRole<HTMLInputElement>("searchbox", { name: "Search settings" });
  fireEvent.change(search, { target: { value: "nonexistent setting" } });
  const results = screen.getByRole("navigation", { name: "Matching settings" });
  expect(within(results).getByText("No matching settings")).toBeTruthy();
  expect(within(results).queryByRole("button")).toBeNull();
  expect(draft.value).toBe("Unsaved name");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(search.value).toBe("");
  expect(screen.queryByRole("navigation", { name: "Matching settings" })).toBeNull();
  expect(screen.getByRole("tab", { name: "Account" })).toBeTruthy();
  expect(draft.value).toBe("Unsaved name");
});

it("supports keyboard results and waits for IME composition before opening a category", async () => {
  const { mounted } = await openPanel();
  const search = screen.getByRole<HTMLInputElement>("searchbox", { name: "Search settings" });
  fireEvent.change(search, { target: { value: "browser" } });
  fireEvent.keyDown(search, { key: "Enter", code: "Enter", isComposing: true });
  expect(mounted).not.toHaveBeenCalled();
  expect(search.value).toBe("browser");
  fireEvent.keyDown(search, { key: "ArrowDown", code: "ArrowDown" });
  const results = screen.getByRole("navigation", { name: "Matching settings" });
  expect(document.activeElement).toBe(
    within(results).getByRole("button", { name: "Signed-in sessions" }),
  );
  search.focus();
  fireEvent.keyDown(search, { key: "Enter", code: "Enter" });
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("tabpanel").textContent).toBe("Session controls");
  expect(search.value).toBe("");
});

it.each(["input", "result"])(
  "clears search from %s on the first Escape and closes on the next",
  async (target) => {
    const { router } = await openPanel();
    const search = screen.getByRole<HTMLInputElement>("searchbox", { name: "Search settings" });
    fireEvent.change(search, { target: { value: "language" } });
    if (target === "result") fireEvent.keyDown(search, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.keyDown(target === "result" ? document.activeElement! : search, {
      key: "Escape",
      code: "Escape",
    });
    expect(search.value).toBe("");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/account");
    fireEvent.keyDown(search, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
  },
);

it("searches English keywords while displaying Chinese settings", async () => {
  localStorage.setItem("raypx_locale", "zh");
  await openPanel();
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索设置" }), {
    target: { value: "PrIvAcY" },
  });
  const results = screen.getByRole("navigation", { name: "匹配的设置" });
  expect(within(results).getByRole("button", { name: "诊断与使用情况" })).toBeTruthy();
});

it.each(["ctrlKey", "metaKey"])(
  "focuses and selects settings search with %s+K",
  async (modifier) => {
    await openPanel();
    const search = screen.getByRole<HTMLInputElement>("searchbox", { name: "Search settings" });
    fireEvent.change(search, { target: { value: "language" } });
    const draft = screen.getByRole("textbox", { name: "Draft name" });
    draft.focus();
    fireEvent.keyDown(draft, { key: "k", code: "KeyK", [modifier]: true });
    expect(document.activeElement).toBe(search);
    expect([search.selectionStart, search.selectionEnd]).toEqual([0, search.value.length]);
  },
);

it("moves through search results with arrows and Home/End without opening categories", async () => {
  const { mounted } = await openPanel();
  const search = screen.getByRole("searchbox", { name: "Search settings" });
  fireEvent.change(search, { target: { value: "sign" } });
  const results = screen.getByRole("navigation", { name: "Matching settings" });
  const [first, last] = within(results).getAllByRole("button");
  fireEvent.keyDown(search, { key: "Home", code: "Home" });
  expect(document.activeElement).toBe(search);
  fireEvent.keyDown(search, { key: "ArrowUp", code: "ArrowUp" });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last!, { key: "ArrowDown", code: "ArrowDown" });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first!, { key: "End", code: "End" });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last!, { key: "Home", code: "Home" });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first!, { key: "ArrowUp", code: "ArrowUp" });
  expect(document.activeElement).toBe(last);
  expect(mounted).not.toHaveBeenCalled();
  expect(screen.getByRole("tabpanel").textContent).toContain("Draft name");
});

it("lets a nested language menu handle Escape without clearing settings search", async () => {
  const { router } = await openPanel();
  fireEvent.click(screen.getByRole("tab", { name: "Device preferences" }));
  const search = screen.getByRole<HTMLInputElement>("searchbox", { name: "Search settings" });
  fireEvent.change(search, { target: { value: "system" } });
  fireEvent.click(screen.getByRole("combobox", { name: "Language" }));
  const option = await screen.findByRole("option", { name: "简体中文" });
  fireEvent.keyDown(option, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
  expect(search.value).toBe("system");
  expect(router.state.location.pathname).toBe("/account");
});
