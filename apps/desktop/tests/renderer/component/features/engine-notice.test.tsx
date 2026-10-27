/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { EngineNotice } from "../../../../src/features/engine/notice";
afterEach(cleanup);
it("requires an explicit answer before replacing a host with active work", async () => {
  localStorage.setItem("raypx_locale", "en");
  const restart = vi.fn(async () => true);
  render(
    <BrowserLanguageProvider>
      <EngineNotice code="HOST_VERSION_MISMATCH" restart={restart} />
    </BrowserLanguageProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop old host and update" }));
  let dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText(/cancels its active tasks/)).toBeTruthy();
  expect(restart).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(restart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Stop old host and update" }));
  dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Stop old host and update" }));
  await vi.waitFor(() => expect(restart).toHaveBeenCalledExactlyOnceWith(true));
});
