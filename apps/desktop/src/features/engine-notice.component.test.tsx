/** @vitest-environment happy-dom */
import { BrowserLanguageProvider } from "../i18n.js";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { EngineNotice } from "./engine/notice.js";
afterEach(cleanup);
it("requires an explicit answer before replacing the Desktop session service", async () => {
  localStorage.setItem("raypx_locale", "en");
  const restart = vi.fn(async () => true);
  render(
    <BrowserLanguageProvider>
      <EngineNotice code="HOST_VERSION_MISMATCH" restart={restart} />
    </BrowserLanguageProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop old service and update" }));
  let dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText(/closes Desktop connections/)).toBeTruthy();
  expect(restart).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(restart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Stop old service and update" }));
  dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Stop old service and update" }));
  await vi.waitFor(() => expect(restart).toHaveBeenCalledExactlyOnceWith(true));
});
