/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useLocale, useLanguagePreference } from "@raypx/i18n/browser";
import { useTheme } from "@raypx/ui/themes";
import { useEffect, type ReactNode } from "react";
import { DEVICE_PREFERENCES_KEY, type PreferenceSnapshot } from "../../../preferences";
import { DesktopPreferencesProvider } from "../../../src/preferences";

const mocks = vi.hoisted(() => ({ isDesktop: vi.fn(), save: vi.fn() }));
vi.mock("../../../src/lib/desktop", () => ({
  isDesktop: mocks.isDesktop,
  saveDesktopPreferences: mocks.save,
}));

function Probe() {
  const { preference, setPreference, hydrated } = useLanguagePreference();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  return (
    <>
      <output>{`${theme}:${preference}:${locale}:${hydrated}`}</output>
      <button onClick={() => setPreference("en")}>English</button>
      <button onClick={() => setPreference("system")}>System</button>
      <button onClick={() => setTheme("light")}>Light</button>
    </>
  );
}

function snapshot(value: PreferenceSnapshot) {
  Object.defineProperty(window, DEVICE_PREFERENCES_KEY, { value, configurable: true });
}
function mount(children: ReactNode = <Probe />) {
  return render(<DesktopPreferencesProvider>{children}</DesktopPreferencesProvider>);
}

beforeEach(() => {
  localStorage.clear();
  mocks.isDesktop.mockReturnValue(true);
  mocks.save.mockResolvedValue(true);
  Object.defineProperty(navigator, "languages", { value: ["en-US"], configurable: true });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, DEVICE_PREFERENCES_KEY);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("Desktop preference initialization", () => {
  it("uses the native snapshot when stale WebView values disagree", async () => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("raypx_locale", "en");
    snapshot({ status: "valid", preferences: { theme: "dark", locale: "zh" } });
    mount();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("dark:zh:zh:true"));
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("English"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ theme: "dark", locale: "en" }));
  });

  it("restores directly when both WebView reads and writes throw", async () => {
    snapshot({ status: "valid", preferences: { theme: "dark", locale: "zh" } });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    mount();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("dark:zh:zh:true"));
    fireEvent.click(screen.getByText("Light"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ theme: "light", locale: "zh" }));
  });

  it("migrates historical storage only when the native file is missing", async () => {
    snapshot({ status: "missing", preferences: { theme: "system", locale: "system" } });
    localStorage.setItem("theme", "dark");
    localStorage.setItem("voidmix_locale", "zh");
    const phases: { hydrated: boolean; writes: number }[] = [];
    function InitializationProbe() {
      const { hydrated } = useLanguagePreference();
      useEffect(() => {
        phases.push({ hydrated, writes: mocks.save.mock.calls.length });
      }, [hydrated]);
      return <Probe />;
    }
    const { unmount } = mount(<InitializationProbe />);
    expect(phases[0]).toEqual({ hydrated: false, writes: 0 });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ theme: "dark", locale: "zh" }));
    expect(mocks.save.mock.calls).toEqual([[{ theme: "dark", locale: "zh" }]]);
    fireEvent.click(screen.getByText("System"));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenLastCalledWith({ theme: "dark", locale: "system" }),
    );
    unmount();
    snapshot({ status: "valid", preferences: { theme: "dark", locale: "system" } });
    localStorage.setItem("voidmix_locale", "zh");
    mount();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("dark:system:en:true"));
  });

  it("uses every system language candidate on the first translated render", () => {
    snapshot({ status: "valid", preferences: { theme: "dark", locale: "system" } });
    Object.defineProperty(navigator, "languages", {
      value: ["fr-FR", "zh-CN", "en-US"],
      configurable: true,
    });
    const locales: string[] = [];
    function FirstRender() {
      locales.push(useLocale());
      return <Probe />;
    }
    mount(<FirstRender />);
    expect(locales[0]).toBe("zh");
  });

  it("uses safe defaults on a native read error without rewriting the file", async () => {
    snapshot({ status: "error", preferences: { theme: "system", locale: "system" } });
    localStorage.setItem("theme", "dark");
    localStorage.setItem("raypx_locale", "zh");
    mount();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("system:system:en:true"),
    );
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("English"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ theme: "system", locale: "en" }));
  });
});
