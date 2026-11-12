/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { mocks, page, signIn } from "../tests/helpers/router-auth.js";

function expectHomepageEntries() {
  const navigation = within(screen.getByRole("navigation", { name: "Workspace" }));
  for (const [name, href] of [
    ["Projects", "/projects"],
    ["Waiting", "/approvals"],
    ["Automations", "/automations"],
    ["Memory and templates", "/memory"],
  ] as const) {
    expect(navigation.getByRole("link", { name })).toHaveAttribute("href", href);
  }
  expect(screen.getByRole("link", { name: "Open projects" })).toHaveAttribute("href", "/projects");
  expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute("href", "/tasks");
  expect(screen.getByRole("img", { name: "Desktop to Web connection" })).toBeTruthy();
  const steps = screen.getByRole("heading", { name: "How it works" }).nextElementSibling;
  expect(steps?.tagName).toBe("OL");
  expect(within(steps as HTMLElement).getAllByRole("listitem")).toHaveLength(3);
}

it("renders the landing page without account or private workspace reads", async () => {
  mocks.sessionPending = true;
  const router = await page("/");
  expect(router.state.location.pathname).toBe("/");
  expect(screen.getByRole("heading", { name: "Run locally. Review remotely." })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Loading…" })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  expectHomepageEntries();
  expect(mocks.loadAccount).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.tasks).not.toHaveBeenCalled();
  expect(mocks.devices).not.toHaveBeenCalled();
  expect(mocks.approvals).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "Open projects" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
});

it("keeps the homepage sign-in destinations and draft privacy for confirmed guests", async () => {
  const router = await page("/");
  expect(await screen.findByRole("button", { name: "Sign in" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "Sign in to connect a computer" })).toHaveAttribute(
    "href",
    "/login?returnTo=%2Fsettings",
  );
  expectHomepageEntries();
  const privacy = screen.getByRole("button", { name: "Draft privacy" });
  fireEvent.click(privacy);
  expect(
    await screen.findByText("Drafts stay on this device until you sign in and send."),
  ).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
});

it("shows signed-in homepage actions and account menu without workspace reads", async () => {
  signIn();
  const router = await page("/");
  expectHomepageEntries();
  expect(await screen.findByRole("button", { name: "Account menu" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "Connect a computer" })).toHaveAttribute(
    "href",
    "/settings",
  );
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  expect(mocks.loadAccount).not.toHaveBeenCalled();
  await waitFor(() => expect(mocks.access).toHaveBeenCalledTimes(1));
  expect(mocks.tasks).not.toHaveBeenCalled();
  expect(mocks.devices).not.toHaveBeenCalled();
  expect(mocks.approvals).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Language" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "简体中文" }));
  expect(await screen.findByRole("link", { name: "打开项目" })).toHaveAttribute(
    "href",
    "/projects",
  );
  expect(screen.getByRole("link", { name: "连接电脑" })).toHaveAttribute("href", "/settings");
  expect(screen.getByRole("link", { name: "定时任务" })).toHaveAttribute("href", "/automations");
  expect(router.state.location.pathname).toBe("/");
});

it.each([false, true])(
  "keeps homepage connection actions with stale session data: %s",
  async (stale) => {
    if (stale) signIn();
    mocks.sessionError = true;
    await page("/");
    expectHomepageEntries();
    expect(screen.getByRole("heading", { name: "Run locally. Review remotely." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry account" })).toBeNull();
    expect(screen.getByRole("button", { name: stale ? "Account menu" : "Sign in" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: stale ? "Sign in" : "Account menu" })).toBeNull();
    expect(
      screen.getByRole("link", {
        name: stale ? "Connect a computer" : "Sign in to connect a computer",
      }),
    ).toHaveAttribute("href", stale ? "/settings" : "/login?returnTo=%2Fsettings");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(mocks.loadAccount).not.toHaveBeenCalled();
    expect(mocks.devices).not.toHaveBeenCalled();
  },
);

it("changes theme and language on the landing page without account reads", async () => {
  const router = await page("/");
  const themeToggle = screen.getByRole("button", { name: "Appearance: Follow system" });
  expect(themeToggle).toHaveAccessibleDescription("Follow system → Light");
  fireEvent.click(themeToggle);
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
  expect(localStorage.getItem("theme")).toBe("light");
  expect(themeToggle).toHaveAccessibleName("Appearance: Light");
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(themeToggle);
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(themeToggle).toHaveAccessibleName("Appearance: Dark");
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Language" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "简体中文" }));
  await screen.findByRole("button", { name: "语言" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(localStorage.getItem("raypx_locale")).toBe("zh");
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(document.documentElement.lang).toBe("zh");
  expect(themeToggle).toHaveAccessibleName("外观: 深色");
  expect(themeToggle).toHaveAccessibleDescription("深色 → 跟随系统");
  fireEvent.click(themeToggle);
  await waitFor(() => expect(localStorage.getItem("theme")).toBe("system"));
  expect(themeToggle).toHaveAccessibleName("外观: 跟随系统");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(localStorage.getItem("raypx_locale")).toBe("zh");
  expect(router.state.location.pathname).toBe("/");
  expect(mocks.loadAccount).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.tasks).not.toHaveBeenCalled();
  expect(mocks.devices).not.toHaveBeenCalled();
  expect(mocks.approvals).not.toHaveBeenCalled();
});

it("keeps homepage session errors on the connect action without private features", async () => {
  mocks.sessionError = true;
  await page("/");
  expect(screen.getByRole("heading", { name: "Run locally. Review remotely." })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "Sign in to connect a computer" })).toHaveAttribute(
    "href",
    "/login?returnTo=%2Fsettings",
  );
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry account" })).toBeNull();
  expect(mocks.refetch).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.tasks).not.toHaveBeenCalled();
});
