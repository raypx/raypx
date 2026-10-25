/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import type { ControlInfo } from "@raypx/contracts/terminal";
const mocks = vi.hoisted(() => ({ request: vi.fn(), installed: false, conflict: false }));
vi.mock("../../../../src/lib/desktop", () => ({ localRequest: mocks.request }));
import { TerminalSettings } from "../../../../src/features/tasks/terminal-settings";
beforeEach(() => {
  localStorage.setItem("raypx_locale", "en");
  mocks.installed = false;
  mocks.conflict = false;
  mocks.request.mockImplementation(
    async (method: string, params?: { recoverModified?: boolean }) => {
      if (method === "observed.settings") return { rootIds: [], away: false, waitSeconds: 300 };
      if (method === "connectors.status")
        return [
          {
            provider: "claude",
            installed: mocks.installed,
            hookInstalled: true,
            modified: false,
            repairable: mocks.conflict && !mocks.installed,
            error: mocks.conflict && !mocks.installed ? "INSTALLATION_CONFLICT" : null,
          },
        ];
      if (method === "connectors.install") {
        if (!params?.recoverModified) throw new Error("INSTALLATION_BUSY: private fixture detail");
        mocks.installed = true;
        return { installed: true };
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount() {
  return render(
    <BrowserLanguageProvider>
      <TerminalSettings
        accountId="account"
        info={{ authorized: true, persistent: true, terminalSupported: true } as ControlInfo}
        projects={[]}
      />
    </BrowserLanguageProvider>,
  );
}
it("shows an actionable installation failure instead of the connection error", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Repair hook" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Another installation is running. Wait for it to finish, then retry.",
  );
  expect(screen.queryByText(/private fixture/)).toBeNull();
  expect(screen.getByRole("button", { name: "Repair hook" }).hasAttribute("disabled")).toBe(false);
});
it("backs up modified programs only after an explicit confirmation and supports cancellation", async () => {
  mocks.conflict = true;
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Back up and replace hook" }));
  await screen.findByRole("alertdialog");
  expect(
    mocks.request.mock.calls.filter(([method]) => method === "connectors.install"),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Back up and replace hook" }));
  fireEvent.click(await screen.findByRole("button", { name: "Back up and replace" }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith("connectors.install", {
      provider: "claude",
      recoverModified: true,
    }),
  );
  await screen.findByText("Hook installed");
});
