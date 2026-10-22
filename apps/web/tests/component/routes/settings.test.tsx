/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { ThemeProvider } from "@raypx/ui/themes";
import { Route } from "../../../src/routes/(app)/settings";

const SettingsPage = Route.options.component!;

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
describe("device settings", () => {
  it("persists appearance and language independently of any account", async () => {
    render(
      <ThemeProvider>
        <BrowserLanguageProvider>
          <SettingsPage />
        </BrowserLanguageProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zh" } });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "按你的习惯设置" })).toBeTruthy(),
    );
    expect(localStorage.getItem("raypx_locale")).toBe("zh");
    expect(document.documentElement.lang).toBe("zh");
  });
});
