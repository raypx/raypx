import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createBrowserLanguage } from "./browser.js";
import { createIntlClient } from "./client.js";
import { createLocaleRuntime } from "./locale.js";

const runtime = createLocaleRuntime({
  locales: ["en", "zh"] as const,
  defaultLocale: "en",
  cookieName: "locale",
});
const en = { common: { settings: "Settings" } } as const;
const client = createIntlClient<typeof en>()(runtime);
const { useLanguagePreference, useLocale, useTranslations } = client;
const { BrowserLanguageProvider, preferences } = createBrowserLanguage(client, runtime, {
  messages: { en, zh: { common: { settings: "设置" } } },
  storageKey: "app_locale",
  legacyStorageKeys: ["old_locale"],
});
const readBrowserPreference = preferences.read;

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

describe("browser language preferences", () => {
  it("hydrates exactly with the server snapshot before reconciling device preferences", () => {
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem("app_locale", "zh");
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
  it("persists an explicit choice even when the effective language already matches", () => {
    render(
      <BrowserLanguageProvider>
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("system:en:true");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByTestId("state").textContent).toBe("en:en:true");
    expect(localStorage.getItem("app_locale")).toBe("en");
    expect(document.cookie).toContain("locale=en");
  });
  it("falls back to navigator.language when the language list is empty", () => {
    system([]);
    vi.spyOn(navigator, "language", "get").mockReturnValue("zh-SG");
    render(
      <BrowserLanguageProvider>
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("system:zh:true");
  });
  it("matches all system preferences consistently with the server and follows changes", () => {
    system(["fr-FR", "zh-CN"]);
    render(
      <BrowserLanguageProvider initialSystemLocales={["fr-FR", "zh-CN"]}>
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("system:zh:true");
    system(["en-US"]);
    fireEvent(window, new Event("languagechange"));
    expect(screen.getByText("Settings")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Chinese" }));
    fireEvent(window, new Event("languagechange"));
    expect(screen.getByText("设置")).toBeTruthy();
    expect(localStorage.getItem("app_locale")).toBe("zh");
  });
  it("preserves a cookie-only user's preference in device storage", () => {
    document.cookie = "locale=zh; Path=/";
    render(
      <BrowserLanguageProvider initialPreference="zh">
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByText("设置")).toBeTruthy();
    expect(localStorage.getItem("app_locale")).toBe("zh");
  });
  it("preserves the initial snapshot when reads are unavailable and switches without writable storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(
      <BrowserLanguageProvider initialPreference="en">
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("en:en:true");
    fireEvent.click(screen.getByRole("button", { name: "Chinese" }));
    expect(screen.getByTestId("state").textContent).toBe("zh:zh:true");
  });
  it.each(["system", "invalid"])(
    "lets an explicit new preference win over legacy storage and cookies: %s",
    async (value) => {
      localStorage.setItem("app_locale", value);
      localStorage.setItem("old_locale", "zh");
      document.cookie = "locale=zh; Path=/";
      render(
        <BrowserLanguageProvider>
          <Probe />
        </BrowserLanguageProvider>,
      );
      expect(screen.getByTestId("state").textContent).toBe("system:en:true");
      await waitFor(() => expect(document.cookie).not.toContain("locale="));
    },
  );
  it("migrates the legacy value only after the replacement write succeeds", () => {
    localStorage.setItem("old_locale", "zh-CN");
    expect(readBrowserPreference()).toBe("zh");
    expect(localStorage.getItem("app_locale")).toBe("zh");
    expect(localStorage.getItem("old_locale")).toBeNull();
    localStorage.clear();
    localStorage.setItem("old_locale", "zh");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readBrowserPreference()).toBe("zh");
    expect(localStorage.getItem("old_locale")).toBe("zh");
  });
  it("syncs only localStorage changes and handles removal and clear without re-running migration", async () => {
    render(
      <BrowserLanguageProvider>
        <Probe />
      </BrowserLanguageProvider>,
    );
    storage("app_locale", "zh", sessionStorage);
    expect(screen.getByTestId("state").textContent).toBe("system:en:true");
    storage("other", "zh");
    expect(screen.getByTestId("state").textContent).toBe("system:en:true");
    storage("app_locale", "zh");
    expect(screen.getByText("设置")).toBeTruthy();
    expect(document.cookie).toContain("locale=zh");
    storage("app_locale", "invalid");
    expect(screen.getByTestId("state").textContent).toBe("system:en:true");
    await waitFor(() => expect(document.cookie).not.toContain("locale="));
    storage("app_locale", "zh");
    localStorage.setItem("old_locale", "zh");
    storage("app_locale", null);
    expect(screen.getByTestId("state").textContent).toBe("system:en:true");
    await waitFor(() => expect(document.cookie).not.toContain("locale="));
    storage("app_locale", "zh");
    storage(null, null);
    expect(screen.getByTestId("state").textContent).toBe("system:en:true");
  });
  it("keeps native snapshots authoritative and reports hydration before persistence", async () => {
    localStorage.setItem("app_locale", "zh");
    render(
      <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("en:en:true");
    storage("app_locale", "zh");
    expect(screen.getByTestId("state").textContent).toBe("en:en:true");
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(localStorage.getItem("app_locale")).toBe("system");
    await waitFor(() => expect(document.cookie).not.toContain("locale="));
  });
  it("keeps a cross-window reset after remount even when a legacy key survives", () => {
    localStorage.setItem("app_locale", "zh");
    localStorage.setItem("old_locale", "zh");
    const first = render(
      <BrowserLanguageProvider>
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("zh:zh:true");
    localStorage.removeItem("app_locale");
    storage("app_locale", null);
    expect(localStorage.getItem("app_locale")).toBe("system");
    expect(localStorage.getItem("old_locale")).toBe("zh");
    first.unmount();
    render(
      <BrowserLanguageProvider>
        <Probe />
      </BrowserLanguageProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("system:en:true");
    localStorage.clear();
    storage(null, null);
    expect(localStorage.getItem("app_locale")).toBe("system");
  });
});
