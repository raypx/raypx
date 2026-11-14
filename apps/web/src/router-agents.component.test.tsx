import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { mocks, page, signIn } from "../tests/helpers/router-auth.js";

it("redirects guests before private reads and preserves the validated conversation destination", async () => {
  const destination =
    "/agents?spaceId=11111111-1111-4111-8111-111111111111&agentId=22222222-2222-4222-8222-222222222222";
  const router = await page(destination);
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toMatchObject({ returnTo: destination });
  expect(mocks.agentsSpaces).not.toHaveBeenCalled();
});

it("mounts the shared Agent workspace for a confirmed member without a deployment permission", async () => {
  signIn();
  await page("/agents");
  expect(
    await screen.findByRole("heading", { name: "Create a Space to get started.", level: 1 }),
  ).toBeVisible();
  expect(screen.getAllByRole("heading", { name: "Create a Space to get started." })).toHaveLength(
    1,
  );
  expect(screen.getByRole("main").firstElementChild?.className).toContain("h-full");
  await waitFor(() => expect(mocks.agentsSpaces).toHaveBeenCalledOnce());
  expect(screen.queryByRole("link", { name: "Projects" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Waiting" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Automations" })).toBeNull();
  expect(screen.queryByRole("link", { name: "New session" })).toBeNull();
  expect(screen.getByRole("link", { name: "Raypx" })).toHaveAttribute("href", "/agents");
  expect(screen.queryByRole("group", { name: "Workspace" })).toBeNull();
});

it("does not mount private conversation reads while the session is unavailable", async () => {
  mocks.sessionError = true;
  mocks.loadAccount.mockResolvedValue({ status: "unavailable" });
  await page("/agents");
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(mocks.agentsSpaces).not.toHaveBeenCalled();
});

it("searches only existing member destinations through the command shortcut", async () => {
  signIn();
  await page("/agents");
  await screen.findByRole("heading", { name: "Create a Space to get started.", level: 1 });
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const palette = within(await screen.findByRole("dialog", { name: "Search" }));
  expect(palette.getByRole("option", { name: "Agents" })).toBeVisible();
  expect(palette.getByRole("option", { name: "Settings" })).toBeVisible();
  expect(palette.queryByRole("option", { name: "Memory and templates" })).toBeNull();
  expect(
    palette.queryByRole("option", { name: /Projects|Waiting|Automations|New session/ }),
  ).toBeNull();
  expect(palette.queryByRole("option", { name: "Administration console" })).toBeNull();
});
