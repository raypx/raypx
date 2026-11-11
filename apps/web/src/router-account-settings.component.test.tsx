/** @vitest-environment happy-dom */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { accessForRole } from "@raypx/account/access";
import { mocks, page, signIn } from "../tests/helpers/router-auth.js";

it.each(["/", "/settings", "/admin"])(
  "opens account settings above %s without replacing its route",
  async (path) => {
    signIn("admin");
    const router = await page(path);
    fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Account$/ }));
    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    expect(await within(dialog).findByLabelText("Display name")).toHaveValue("Ada");
    expect(router.state.location.pathname).toBe(path);
    expect(router.state.location.hash).toBe("settings/account");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.pathname).toBe(path);
    expect(router.state.location.hash).toBe("");
  },
);

it("preserves the settings anchor through a guest's sign-in link without private reads", async () => {
  const router = await page("/#settings/account");
  const dialog = await screen.findByRole("dialog", { name: "Settings" });
  expect(within(dialog).getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login?returnTo=%2F%23settings%2Faccount",
  );
  expect(router.state.location.href).toBe("/#settings/account");
  expect(mocks.loadAccount).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Display name")).toBeNull();
});

it.each(["settings/unknown", "settings/account/extra", "main"])(
  "ignores unsupported #%s without loading account data",
  async (hash) => {
    await page(`/#${hash}`);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.loadAccount).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
  },
);

it("enforces account management permission before mounting account reads", async () => {
  signIn();
  mocks.access.mockResolvedValue(accessForRole("guest", "user-1"));
  await page("/#settings/account");
  const dialog = await screen.findByRole("dialog", { name: "Settings" });
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("You do not have permission");
  expect(mocks.loadAccount).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Display name")).toBeNull();
});

it("discards another account's draft while keeping the selected settings category", async () => {
  signIn();
  const router = await page("/#settings/account");
  fireEvent.change(await screen.findByLabelText("Display name"), {
    target: { value: "Private old draft" },
  });
  signIn("member", "user-2");
  mocks.session!.user.name = "Grace";
  await act(async () => router.navigate({ href: "/?view=profile#settings/account" }));
  expect(await screen.findByLabelText("Display name")).toHaveValue("Grace");
  expect(screen.queryByDisplayValue("Private old draft")).toBeNull();
  expect(router.state.location.hash).toBe("settings/account");
  expect(
    router.options.context.queryClient.getQueryData([
      "account",
      "https://api.raypx.example",
      "user-1",
    ]),
  ).toBeUndefined();
  expect(
    router.options.context.queryClient.getQueryData([
      "account",
      "https://api.raypx.example",
      "user-2",
    ]),
  ).toMatchObject({
    status: "signed-in",
    account: { id: "user-2", name: "Grace" },
  });
});

it("keeps failed account reads retryable without showing another identity", async () => {
  signIn();
  mocks.loadAccount.mockResolvedValue({
    status: "signed-in",
    account: { id: "other", name: "Private other account", email: "private@example.test" },
  });
  await page("/#settings/account");
  const dialog = await screen.findByRole("dialog", { name: "Settings" });
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to connect");
  expect(screen.queryByText("Private other account")).toBeNull();
  expect(screen.queryByLabelText("Display name")).toBeNull();
  mocks.loadAccount.mockResolvedValue({ status: "signed-in", account: mocks.session!.user });
  fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
  expect(await screen.findByLabelText("Display name")).toHaveValue("Ada");
});

it("sends the first password setup link to the signed-in account email", async () => {
  signIn();
  mocks.listAccounts.mockResolvedValue({
    data: [{ userId: "user-1", providerId: "github" }],
    error: null,
  });
  mocks.requestPasswordReset
    .mockResolvedValueOnce({ error: { code: "MAIL_NOT_CONFIGURED", status: 503 } })
    .mockResolvedValueOnce({ data: {}, error: null });
  await page("/#settings/password");

  const send = await screen.findByRole("button", { name: "Send setup link" });
  expect(screen.queryByLabelText("Current password")).toBeNull();
  expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  fireEvent.click(send);
  expect(await screen.findByRole("alert")).toHaveTextContent("Email delivery is unavailable");
  expect(send).toBeEnabled();

  fireEvent.click(send);
  expect(
    await screen.findByText("Check your inbox and open the link to set your password."),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: /^Resend in / })).toBeDisabled();
  expect(mocks.requestPasswordReset).toHaveBeenCalledTimes(2);
  expect(mocks.requestPasswordReset).toHaveBeenLastCalledWith(
    expect.objectContaining({
      email: "ada@example.test",
      redirectTo: "https://raypx.example/reset-password",
    }),
  );
});

it("keeps password setup hidden on failed account reads and requires the current password for a linked credential", async () => {
  signIn();
  mocks.listAccounts.mockResolvedValueOnce({ error: { code: "OFFLINE" } }).mockResolvedValueOnce({
    data: [
      { userId: "user-1", providerId: "github" },
      { userId: "user-1", providerId: "credential" },
    ],
    error: null,
  });
  await page("/#settings/password");

  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to connect");
  expect(screen.queryByRole("button", { name: "Send setup link" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  fireEvent.click(await screen.findByRole("button", { name: "Change password" }));
  expect(await screen.findByLabelText("Current password")).toBeRequired();
  expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
  expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
});
