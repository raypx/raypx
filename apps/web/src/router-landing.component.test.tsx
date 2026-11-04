/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { mocks, page, signIn } from "../tests/helpers/router-auth";

it("renders the landing page without account or private workspace reads", async () => {
  mocks.sessionPending = true;
  const router = await page("/");
  expect(router.state.location.pathname).toBe("/");
  expect(screen.getByRole("heading", { name: "Remote sessions and approvals" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Loading…" })).toHaveLength(1);
  for (const button of screen.getAllByRole("button", { name: "Loading…" }))
    expect(button).toBeDisabled();
  expect(mocks.loadAccount).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.tasks).not.toHaveBeenCalled();
  expect(mocks.devices).not.toHaveBeenCalled();
  expect(mocks.approvals).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "Projects" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
});

it("keeps the homepage sign-in destinations for confirmed guests", async () => {
  const router = await page("/");
  expect(await screen.findByRole("button", { name: "Sign in" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "Sign in to connect a computer" })).toHaveAttribute(
    "href",
    "/login?returnTo=%2Fsettings",
  );
  expect(screen.getByText("Write a draft now; sign in to send it.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
});

it("shows signed-in homepage actions and account menu without workspace reads", async () => {
  signIn();
  const router = await page("/");
  expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/projects");
  expect(await screen.findByRole("button", { name: "Account menu" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "Connect a computer" })).toHaveAttribute(
    "href",
    "/settings",
  );
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  expect(screen.queryByText("Write a draft now; sign in to send it.")).toBeNull();
  expect(screen.queryByText("Sign in to answer requests.")).toBeNull();
  expect(mocks.loadAccount).not.toHaveBeenCalled();
  await waitFor(() => expect(mocks.access).toHaveBeenCalledTimes(1));
  expect(mocks.tasks).not.toHaveBeenCalled();
  expect(mocks.devices).not.toHaveBeenCalled();
  expect(mocks.approvals).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Language" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "简体中文" }));
  expect(await screen.findByRole("link", { name: "项目" })).toHaveAttribute("href", "/projects");
  expect(screen.getByRole("link", { name: "连接电脑" })).toHaveAttribute("href", "/settings");
  expect(router.state.location.pathname).toBe("/");
});

it.each([false, true])(
  "offers session retry on the homepage with stale session data: %s",
  async (stale) => {
    if (stale) signIn();
    mocks.sessionError = true;
    await page("/");
    expect(screen.getByRole("heading", { name: "Remote sessions and approvals" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Try again" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleDescription(
      "Unable to connect. Check your connection and try again.",
    );
    fireEvent.click(buttons[0]!);
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
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

it("keeps homepage session errors retryable without mounting private features", async () => {
  mocks.sessionError = true;
  await page("/");
  expect(screen.getByRole("heading", { name: "Remote sessions and approvals" })).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Retry account" }));
  expect(mocks.refetch).toHaveBeenCalledTimes(1);
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.tasks).not.toHaveBeenCalled();
});
