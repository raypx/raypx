/** @vitest-environment happy-dom */
import { BrowserLanguageProvider } from "../../i18n.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { deferred } from "../../../tests/helpers/desktop.js";
import { CloudTerminalSettings } from "./cloud-terminal-settings.js";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), configure: vi.fn(), local: vi.fn() }));
vi.mock("../../lib/desktop.js", () => ({
  getBridge: async () => ({
    request: { terminalSettings: mocks.settings, terminalConfigure: mocks.configure },
  }),
  localRequest: mocks.local,
}));
const projects = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Work", providers: [], dirty: false },
  { id: "00000000-0000-4000-8000-000000000002", name: "Private", providers: [], dirty: false },
];
const rootIds = projects.map((project) => project.id);
beforeEach(() => {
  localStorage.setItem("raypx_locale", "en");
  mocks.settings.mockResolvedValue({ enabled: false, rootIds: [] });
  mocks.local.mockResolvedValue({ rootIds, away: false, waitSeconds: 300 });
  mocks.configure.mockImplementation(async ({ enabled, rootIds: permittedRoots }) => ({
    enabled,
    rootIds: permittedRoots,
  }));
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function view(accountId = "owner") {
  return (
    <BrowserLanguageProvider>
      <CloudTerminalSettings accountId={accountId} projects={projects} />
    </BrowserLanguageProvider>
  );
}
it("loads both settings together and recovers from an initial read failure", async () => {
  const pending = deferred<{ enabled: boolean; rootIds: string[] }>();
  mocks.settings.mockReturnValueOnce(pending.promise);
  render(view());
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "Loading…");
  expect(screen.queryByRole("switch")).toBeNull();
  expect(mocks.local).toHaveBeenCalledOnce();
  await act(async () => pending.reject(new Error("private credentials")));
  expect((await screen.findByRole("alert")).textContent).not.toContain("private credentials");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect((await screen.findByRole("switch")).getAttribute("aria-checked")).toBe("false");
  expect(mocks.settings).toHaveBeenCalledTimes(2);
  expect(mocks.local).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
});
it("keeps unsaved changes across paired refreshes and removes revoked local grants", async () => {
  mocks.settings.mockResolvedValue({ enabled: true, rootIds: [rootIds[0]] });
  render(view());
  await userEvent.click(await screen.findByRole("switch"));
  await userEvent.click(screen.getByRole("checkbox", { name: "Private" }));
  mocks.local.mockResolvedValue({ rootIds: [rootIds[1]], away: false, waitSeconds: 300 });
  await act(async () => window.dispatchEvent(new Event("raypx:terminal-settings")));
  await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Work" })).toBeNull());
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  expect(screen.getByRole("checkbox", { name: "Private" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save terminal settings" }));
  await waitFor(() =>
    expect(mocks.configure).toHaveBeenCalledWith({
      accountId: "owner",
      enabled: false,
      rootIds: [rootIds[1]],
    }),
  );
});
it("does not let an older refresh overwrite the latest settings or an edit made in flight", async () => {
  render(view());
  await screen.findByRole("switch");
  const older = deferred<{ enabled: boolean; rootIds: string[] }>();
  const newer = deferred<{ enabled: boolean; rootIds: string[] }>();
  mocks.settings.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  await act(async () => window.dispatchEvent(new Event("raypx:terminal-settings")));
  await act(async () => window.dispatchEvent(new Event("raypx:terminal-settings")));
  await userEvent.click(screen.getByRole("switch"));
  await act(async () => newer.resolve({ enabled: false, rootIds: [] }));
  await act(async () => older.resolve({ enabled: false, rootIds: [rootIds[0]!] }));
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("checkbox", { name: "Work" }).getAttribute("aria-checked")).toBe("false");
});
it("isolates accounts from pending reads, drafts and save completions", async () => {
  const saved = deferred<{ enabled: boolean; rootIds: string[] }>();
  const rendered = render(view());
  await userEvent.click(await screen.findByRole("switch"));
  mocks.configure.mockReturnValueOnce(saved.promise);
  fireEvent.click(screen.getByRole("button", { name: "Save terminal settings" }));
  await waitFor(() => expect(mocks.configure).toHaveBeenCalledOnce());
  const oldRead = deferred<{ enabled: boolean; rootIds: string[] }>();
  mocks.settings.mockReturnValueOnce(oldRead.promise);
  await act(async () => window.dispatchEvent(new Event("raypx:terminal-settings")));
  rendered.rerender(view("other"));
  expect((await screen.findByRole("switch")).getAttribute("aria-checked")).toBe("false");
  await act(async () => {
    oldRead.resolve({ enabled: true, rootIds });
    saved.resolve({ enabled: true, rootIds });
  });
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  expect(mocks.settings).toHaveBeenLastCalledWith({ accountId: "other" });
  expect(screen.getByRole("checkbox", { name: "Work" }).getAttribute("aria-checked")).toBe("false");
});
it("preserves a failed save draft and allows an explicit retry", async () => {
  mocks.configure.mockRejectedValueOnce(new Error("private save failure"));
  render(view());
  await userEvent.click(await screen.findByRole("switch"));
  fireEvent.click(screen.getByRole("button", { name: "Save terminal settings" }));
  expect((await screen.findByRole("alert")).textContent).not.toContain("private save failure");
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Save terminal settings" }));
  await waitFor(() => expect(mocks.configure).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
