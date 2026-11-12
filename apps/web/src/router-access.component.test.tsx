/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { accessForRole } from "@raypx/account/access";
import { mocks, page, signIn } from "../tests/helpers/router-auth.js";

describe("menu permissions", () => {
  it("keeps private menu links and their queries hidden for guests", async () => {
    await page("/projects");
    expect(screen.queryByRole("link", { name: "Waiting" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Automations" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Memory and templates" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Admin console" })).toBeNull();
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it.each(["/admin/settings", "/admin/settings/", "/ADMIN/SETTINGS"])(
    "shows member menus and blocks direct navigation to %s before private reads",
    async (path) => {
      signIn();
      await page(path);
      expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
      expect(screen.queryByRole("link", { name: "Automations" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Memory and templates" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Admin console" })).toBeNull();
      expect(mocks.configurationGet).not.toHaveBeenCalled();
    },
  );

  it("removes administrator navigation when the server downgrades the same account", async () => {
    signIn("admin");
    const router = await page("/approvals");
    expect(await screen.findByRole("link", { name: "Admin console" })).toBeTruthy();
    mocks.role = "member";
    await router.options.context.queryClient.invalidateQueries({ queryKey: ["account-access"] });
    await waitFor(() => expect(screen.queryByRole("link", { name: "Admin console" })).toBeNull());
  });

  it("fails closed on permission lookup errors and lets the user retry", async () => {
    signIn("admin");
    mocks.access.mockRejectedValue(new Error("private diagnostic"));
    await page("/admin/settings");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to verify permissions");
    expect(screen.queryByRole("link", { name: "Admin console" })).toBeNull();
    expect(screen.queryByText("private diagnostic")).toBeNull();
    expect(mocks.configurationGet).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue(accessForRole("member", "user-1"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You do not have permission to access this page.")).toBeTruthy();
  });

  it("never carries administrator navigation into another account while grants are pending", async () => {
    signIn("admin");
    const router = await page("/projects");
    expect(await screen.findByRole("link", { name: "Admin console" })).toBeTruthy();
    signIn("member", "user-2");
    mocks.access.mockImplementation(() => new Promise(() => {}));
    void router.navigate({ to: "/admin/settings" });
    await waitFor(() => expect(screen.queryByRole("link", { name: "Admin console" })).toBeNull());
    expect(mocks.configurationGet).not.toHaveBeenCalled();
  });
});

it("uses the same account menu on the homepage and in the workspace", async () => {
  signIn("admin");
  const router = await page("/");
  fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
  expect(await screen.findByRole("menuitem", { name: "Admin console" })).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: "Site settings" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  expect(await screen.findByRole("menuitem", { name: "Admin console" })).toBeTruthy();
});
it("blocks a member's user-management navigation before the page mounts", async () => {
  signIn();
  await page("/admin/users");
  expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
  expect(screen.queryByRole("table", { name: "Users" })).toBeNull();
});
it("blocks remote project reads when the signed-in permission projection is invalid", async () => {
  signIn();
  mocks.access.mockResolvedValue(accessForRole("admin", "another-account"));
  await page("/projects");
  expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
  expect(mocks.devices).not.toHaveBeenCalled();
});

it("retains the account menu on failed logout and clears private caches on success", async () => {
  signIn();
  const router = await page("/projects");
  router.options.context.queryClient.setQueryData(["private-test"], "cached");
  mocks.signOut.mockResolvedValueOnce({
    error: { code: "OFFLINE", message: "private diagnostic" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  expect(screen.queryByRole("menuitem", { name: "Users" })).toBeNull();
  fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to connect");
  expect(screen.queryByText("private diagnostic")).toBeNull();
  expect(router.options.context.queryClient.getQueryData(["private-test"])).toBe("cached");
  mocks.signOut.mockImplementationOnce(async () => {
    mocks.session = null;
    mocks.loadAccount.mockResolvedValue({ status: "signed-out" });
    return { error: null };
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(router.options.context.queryClient.getQueryData(["private-test"])).toBeUndefined();
});
