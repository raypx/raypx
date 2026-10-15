/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider, useLanguagePreference, useTranslations } from "./browser";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
beforeEach(() => {
  localStorage.clear();
});
function Probe() {
  const { preference, setPreference } = useLanguagePreference();
  const c = useTranslations("common");
  return (
    <>
      <output>{c("settings")}</output>
      <span>{preference}</span>
      <button onClick={() => setPreference("zh")}>Chinese</button>
      <button onClick={() => setPreference("system")}>System</button>
    </>
  );
}
describe("browser language preferences", () => {
  it("restores device preferences and survives unavailable persistence", async () => {
    localStorage.setItem("raypx_locale", "en");
    render(
      <BrowserLanguageProvider>
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByText("Settings")).toBeTruthy();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    fireEvent.click(screen.getByRole("button", { name: "Chinese" }));
    await waitFor(() => expect(screen.getByText("设置")).toBeTruthy());
    expect(document.documentElement.lang).toBe("zh");
  });
  it("hydrates with server values, then mirrors device choices into the cookie", async () => {
    localStorage.setItem("raypx_locale", "zh");
    const rendered: string[] = [];
    function FirstRender() {
      rendered.push(useLanguagePreference().preference);
      return null;
    }
    render(
      <BrowserLanguageProvider initialPreference="en" initialSystemLocale="en">
        <FirstRender />
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(rendered[0]).toBe("en");
    await waitFor(() => expect(screen.getByText("设置")).toBeTruthy());
    expect(document.cookie).toContain("locale=zh");
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(document.cookie).not.toContain("locale=");
  });
  it("follows system language changes only when system is selected", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("zh-CN");
    render(
      <BrowserLanguageProvider>
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByText("设置")).toBeTruthy();
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    fireEvent(window, new Event("languagechange"));
    await waitFor(() => expect(screen.getByText("Settings")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Chinese" }));
    fireEvent(window, new Event("languagechange"));
    await waitFor(() => expect(screen.getByText("设置")).toBeTruthy());
    expect(localStorage.getItem("raypx_locale")).toBe("zh");
  });
});
