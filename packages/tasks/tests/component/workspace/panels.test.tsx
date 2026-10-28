import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { TaskPanels } from "../../../src/client/task-panels.js";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
afterEach(() => vi.restoreAllMocks());

function panels(storageKey: string) {
  return (
    <BrowserLanguageProvider>
      <TaskPanels storageKey={storageKey} list="Task list" detail="Task details" detailVisible />
    </BrowserLanguageProvider>
  );
}

it("restores the next namespace's width after resizing the previous namespace", () => {
  localStorage.setItem("server-a", "34");
  localStorage.setItem("server-b", "42");
  const view = render(panels("server-a"));
  const separator = screen.getByRole("separator", { name: "Resize task list and details" });
  fireEvent.keyDown(separator, { key: "End" });
  expect(separator).toHaveAttribute("aria-valuenow", "50");
  view.rerender(panels("server-b"));
  expect(separator).toHaveAttribute("aria-valuenow", "42");
  expect(localStorage.getItem("server-a")).toBe("50");
});

it("accepts another window's width change after a local resize", () => {
  render(panels("server-a"));
  const separator = screen.getByRole("separator", { name: "Resize task list and details" });
  fireEvent.keyDown(separator, { key: "End" });
  localStorage.setItem("server-a", "34");
  fireEvent(window, new StorageEvent("storage", { key: "server-a", newValue: "34" }));
  expect(separator).toHaveAttribute("aria-valuenow", "34");
  localStorage.removeItem("server-a");
  fireEvent(window, new StorageEvent("storage", { key: "server-a", newValue: null }));
  expect(separator).toHaveAttribute("aria-valuenow", "38");
});

it("keeps an unsaved width in memory without leaking it into another namespace", () => {
  localStorage.setItem("server-b", "42");
  const view = render(panels("server-a"));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage unavailable", "QuotaExceededError");
  });
  const separator = screen.getByRole("separator", { name: "Resize task list and details" });
  fireEvent.keyDown(separator, { key: "End" });
  expect(separator).toHaveAttribute("aria-valuenow", "50");
  view.rerender(panels("server-b"));
  expect(separator).toHaveAttribute("aria-valuenow", "42");
});

it("keeps resizing after storage reads and writes become unavailable", () => {
  localStorage.setItem("server-a", "34");
  render(panels("server-a"));
  for (const method of ["getItem", "setItem"] as const)
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException("Storage unavailable", "SecurityError");
    });
  const separator = screen.getByRole("separator", { name: "Resize task list and details" });
  fireEvent.keyDown(separator, { key: "End" });
  expect(separator).toHaveAttribute("aria-valuenow", "50");
});
