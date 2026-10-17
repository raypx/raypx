/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  BrowserLanguageProvider,
  readBrowserPreference,
  useLanguagePreference,
  useLocale,
  useTranslations,
} from "./browser.js";

function system(languages: string[]) {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
  vi.spyOn(navigator, "language", "get").mockReturnValue(languages[0] ?? "en-US");
}
function clearCookies() {
  for (const part of document.cookie.split(";"))
    document.cookie = `${part.split("=")[0]?.trim()}=; Path=/; Max-Age=0`;
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearCookies();
  system(["en-US"]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  clearCookies();
});
function Probe() {
  const { preference, setPreference, hydrated } = useLanguagePreference();
  const locale = useLocale();
  const t = useTranslations("common");
  return (
    <>
      <output data-testid="state">{`${preference}:${locale}:${hydrated}`}</output>
      <output>{t("settings")}</output>
      <button onClick={() => setPreference("zh")}>Chinese</button>
      <button onClick={() => setPreference("en")}>English</button>
      <button onClick={() => setPreference("system")}>System</button>
    </>
  );
}
function storage(key: string | null, newValue: string | null, storageArea: Storage = localStorage) {
  fireEvent(window, new StorageEvent("storage", { key, newValue, storageArea }));
}

describe("Raypx browser language wiring", () => {
  it("hydrates exactly with the server snapshot before reconciling device preferences", () => {
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem("raypx_locale", "zh");
    const rendered: string[] = [];
    function FirstRender() {
      rendered.push(useLanguagePreference().preference);
      return <Probe />;
    }
    const element = (
      <BrowserLanguageProvider initialPreference="en" initialSystemLocales={["en-US"]}>
        <FirstRender />
      </BrowserLanguageProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    expect(container.textContent).toContain("en:en:false");
    rendered.length = 0;
    render(element, { container, hydrate: true, onRecoverableError });
    expect(rendered[0]).toBe("en");
    expect(screen.getByTestId("state").textContent).toBe("zh:zh:true");
    expect(document.cookie).toContain("locale=zh");
    expect(document.documentElement.lang).toBe("zh");
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
  it("migrates the legacy value only after the replacement write succeeds", () => {
    localStorage.setItem("voidmix_locale", "zh-CN");
    expect(readBrowserPreference()).toBe("zh");
    expect(localStorage.getItem("raypx_locale")).toBe("zh");
    expect(localStorage.getItem("voidmix_locale")).toBeNull();
    localStorage.clear();
    localStorage.setItem("voidmix_locale", "zh");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readBrowserPreference()).toBe("zh");
    expect(localStorage.getItem("voidmix_locale")).toBe("zh");
  });
  it("keeps native snapshots authoritative and reports hydration before persistence", () => {
    localStorage.setItem("raypx_locale", "zh");
    render(
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("en:en:true");
    storage("raypx_locale", "zh");
    expect(screen.getByTestId("state").textContent).toBe("en:en:true");
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(localStorage.getItem("raypx_locale")).toBe("system");
    expect(document.cookie).not.toContain("locale=");
  });
});
