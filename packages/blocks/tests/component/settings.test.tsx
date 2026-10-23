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
  Object.defineProperty(navigator, "languages", { value: ["en-US"], configurable: true });
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
    fireEvent.click(screen.getByRole("combobox", { name: "Language" }));
    const chinese = await screen.findByRole("option", { name: "简体中文" });
    fireEvent.pointerDown(chinese, { pointerType: "mouse" });
    fireEvent.click(chinese);
    await waitFor(() => expect(screen.getByRole("region", { name: "语言" })).toBeTruthy());
    expect(localStorage.getItem("raypx_locale")).toBe("zh");
    fireEvent.click(screen.getByRole("combobox", { name: "语言" }));
    const system = await screen.findByRole("option", { name: "跟随系统" });
    fireEvent.pointerDown(system, { pointerType: "mouse" });
    fireEvent.click(system);
    await waitFor(() => expect(screen.getByRole("region", { name: "Language" })).toBeTruthy());
    expect(localStorage.getItem("raypx_locale")).toBe("system");
    expect(screen.getByRole("combobox", { name: "Language" }).textContent).toContain(
      "Follow system",
    );
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});
