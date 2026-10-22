import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { ThemeProvider } from "@raypx/ui/themes";
import {
  AppearanceSettings,
  LanguageSettings,
  SettingsPage,
  SettingsSection,
} from "../../src/components/settings";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});

describe("settings blocks", () => {
  it("labels each section by its heading and keeps the footnote last", () => {
    render(
      <SettingsPage title="Preferences" description="Saved here." footnote="Stays local.">
        <SettingsSection title="Sync" description="Choose a folder.">
          <button type="button">Choose</button>
        </SettingsSection>
      </SettingsPage>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Preferences" })).toBeTruthy();
    const section = screen.getByRole("region", { name: "Sync" });
    expect(section.textContent).toContain("Choose a folder.");
    expect(section.querySelector("button")).toBeTruthy();
    expect(screen.getByText("Stays local.").previousElementSibling).toBe(section);
  });

  it("changes device theme and language preferences", async () => {
    render(
      <ThemeProvider>
        <BrowserLanguageProvider>
          <AppearanceSettings />
          <LanguageSettings />
        </BrowserLanguageProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(localStorage.getItem("theme")).toBe("dark");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zh" } });
    await waitFor(() => expect(screen.getByRole("region", { name: "语言" })).toBeTruthy());
    expect(localStorage.getItem("raypx_locale")).toBe("zh");
  });
});
