/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { mocks, page, signIn } from "../tests/helpers/router-auth.js";

it("keeps the public homepage free of private workspace reads and retired destinations", async () => {
  await page("/");
  expect(
    screen.getByRole("heading", { name: "Agents that keep the conversation going." }),
  ).toBeVisible();
  expect(screen.getByRole("figure", { name: "Workspace example" })).toBeVisible();
  const nav = within(screen.getByRole("navigation", { name: "Workspace" }));
  expect(nav.getByRole("link", { name: "Open Agents" })).toHaveAttribute("href", "/agents");
  for (const name of ["Projects", "Waiting", "Automations", "Sessions"])
    expect(screen.queryByRole("link", { name })).toBeNull();
  expect(mocks.loadAccount).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
});

it("offers Agents with the appropriate sign-in destination", async () => {
  await page("/");
  expect(
    screen
      .getAllByRole("link", { name: "Open Agents" })
      .some((link) => link.getAttribute("href") === "/login?returnTo=%2Fagents"),
  ).toBe(true);
});

it("opens Agents directly for a signed-in account and translates public content", async () => {
  signIn();
  const router = await page("/");
  expect(
    screen
      .getAllByRole("link", { name: "Open Agents" })
      .every((link) => link.getAttribute("href") === "/agents"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Language" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "简体中文" }));
  expect(
    await screen.findByRole("heading", { name: "让智能体持续工作，让对话不断延续。" }),
  ).toBeVisible();
  expect(router.state.location.pathname).toBe("/");
});

it("persists theme and language independently of the account", async () => {
  await page("/");
  fireEvent.click(screen.getByRole("button", { name: "Appearance: Follow system" }));
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
  fireEvent.click(screen.getByRole("button", { name: "Language" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "简体中文" }));
  await waitFor(() => expect(document.documentElement.lang).toBe("zh"));
  expect(localStorage.getItem("theme")).toBe("light");
  expect(localStorage.getItem("raypx_locale")).toBe("zh");
  expect(mocks.loadAccount).not.toHaveBeenCalled();
});
