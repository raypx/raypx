/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { mocks, page } from "../tests/helpers/router-local.js";

it("keeps the cloud scope behind contextual login and returns to that scope afterward", async () => {
  const router = await page("/automations?scope=cloud");
  expect(await screen.findByRole("heading", { name: "Sign in for remote access" })).toBeTruthy();
  expect(mocks.localRequest.mock.calls.some(([method]) => method === "jobs.list")).toBe(false);
  fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  expect(router.state.location.search).toMatchObject({ returnTo: "/automations?scope=cloud" });
});

it("preserves the local automation editor across cloud scope visits without claiming an account", async () => {
  const router = await page("/automations");
  fireEvent.click(screen.getByRole("button", { name: "New automation" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Device-only unsaved edit" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Cloud" }));
  expect(await screen.findByRole("heading", { name: "Sign in for remote access" })).toBeTruthy();
  expect(router.state.location.search).toMatchObject({ scope: "cloud" });
  fireEvent.click(screen.getByRole("tab", { name: "This computer" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Name")).toHaveValue("Device-only unsaved edit"),
  );
  expect(router.state.location.search).toMatchObject({ scope: "local" });
});
