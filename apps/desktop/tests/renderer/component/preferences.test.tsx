/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useLocale, useLanguagePreference } from "@raypx/i18n/browser";
import { useTheme } from "@raypx/ui/themes";
import { type ReactNode } from "react";
import { DEVICE_PREFERENCES_KEY, type NativePreferenceSnapshot } from "../../../preferences";
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
      <button onClick={() => setTheme("dark")}>Dark</button>
    </>
  );
}

function snapshot(value: NativePreferenceSnapshot) {
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
    snapshot({ status: "read", raw: { theme: "dark", locale: "zh" } });
    mount();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("dark:zh:zh:true"));
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("English"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ theme: "dark", locale: "en" }));
  });

  it("restores directly when both WebView reads and writes throw", async () => {
    snapshot({ status: "read", raw: { theme: "dark", locale: "zh" } });
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

  it("starts with defaults when native preferences are missing, ignoring WebView values", async () => {
    snapshot({ status: "missing", raw: null });
    localStorage.setItem("theme", "dark");
    localStorage.setItem("raypx_locale", "zh");
    mount();
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({ theme: "system", locale: "system" }),
    );
    expect(mocks.save.mock.calls).toEqual([[{ theme: "system", locale: "system" }]]);
  });

  it("uses every system language candidate on the first translated render", () => {
    snapshot({ status: "read", raw: { theme: "dark", locale: "system" } });
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
    snapshot({ status: "unreadable", raw: null });
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

it.each([false, new Error("private storage failure")])(
  "shows save failures and retries the latest choices (%s)",
  async (failure) => {
    snapshot({ status: "read", raw: { theme: "dark", locale: "en" } });
    if (failure instanceof Error) mocks.save.mockRejectedValueOnce(failure);
    else mocks.save.mockResolvedValueOnce(failure);
    mount();
    fireEvent.click(screen.getByText("Light"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not be saved");
    expect(alert.textContent).not.toContain("private storage failure");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(mocks.save.mock.calls).toEqual([
      [{ theme: "light", locale: "en" }],
      [{ theme: "light", locale: "en" }],
    ]);
  },
);

it("queues a return to the saved value and ignores an older failed response", async () => {
  snapshot({ status: "read", raw: { theme: "dark", locale: "en" } });
  let finish!: (saved: boolean) => void;
  mocks.save.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  mount();
  fireEvent.click(screen.getByText("System"));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText("English"));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  finish(false);
  await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith({ theme: "dark", locale: "en" }));
  expect(screen.queryByRole("alert")).toBeNull();
});

it("clears failed-save feedback when returning to the confirmed snapshot", async () => {
  snapshot({ status: "read", raw: { theme: "dark", locale: "en" } });
  mocks.save.mockResolvedValueOnce(false);
  mount();
  fireEvent.click(screen.getByText("Light"));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Dark"));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
