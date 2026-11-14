/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { mocks, page } from "../tests/helpers/router-auth.js";

it("opens Agents after sign-in without an explicit return destination", async () => {
  mocks.signIn.mockImplementation(async () => {
    mocks.session = {
      user: { id: "user-1", name: "Ada", email: "ada@example.test" },
      session: { id: "session-1" },
    };
    mocks.loadAccount.mockResolvedValue({ status: "signed-in", account: mocks.session.user });
    return { data: {}, error: null };
  });
  const router = await page("/login");
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "ada@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
  await waitFor(() => expect(router.state.location.pathname).toBe("/agents"));
  expect(
    await screen.findByRole("heading", { name: "Create a Space to get started.", level: 1 }),
  ).toBeVisible();
  expect(screen.queryByLabelText("Password")).toBeNull();
});

it("retries a failed session refresh without submitting credentials again", async () => {
  mocks.signIn.mockImplementation(async () => {
    mocks.session = {
      user: { id: "user-1", name: "Ada", email: "ada@example.test" },
      session: { id: "session-1" },
    };
    mocks.sessionError = true;
    mocks.loadAccount.mockResolvedValue({ status: "signed-in", account: mocks.session.user });
    return { data: {}, error: null };
  });
  const router = await page("/login?returnTo=%2Fsettings");
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "ada@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
  await screen.findByText(/You’re signed in, but the page could not load/);
  expect(router.state.location.pathname).toBe("/login");
  mocks.sessionError = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
  expect(mocks.signIn).toHaveBeenCalledTimes(1);
});
