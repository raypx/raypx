/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@voidmix/i18n/client";
import { ThemeProvider } from "@voidmix/ui/theme";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { messages } from "../../../tests/fixtures/messages";
import { ThemeSwitcher } from "../../components/theme-switcher";

afterEach(() => cleanup());

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

function renderThemeSwitcher() {
  render(
    <I18nProvider locale="en" messages={messages}>
      <ThemeProvider disableScript defaultTheme="system" storageKey={false}>
        <ThemeSwitcher />
      </ThemeProvider>
    </I18nProvider>,
  );
  return userEvent.setup();
}

describe("theme switcher", () => {
  it("renders an accessible segmented control with the current theme selected", () => {
    renderThemeSwitcher();

    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
    expect(screen.getAllByRole("radio").map((item) => item.getAttribute("aria-label"))).toEqual([
      "Light",
      "Dark",
      "System",
    ]);
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "System" })).toHaveClass("bg-background");
    expect(screen.getByRole("radio", { name: "System" })).not.toHaveClass("bg-primary");
  });

  it("updates the selected theme and supports arrow-key navigation", async () => {
    const user = renderThemeSwitcher();

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "false");

    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "System" })).toHaveFocus();
  });
});
