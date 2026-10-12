import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { getDesktopLocale, getDesktopLocaleHeaders } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktop locale transport helpers", () => {
  it("prefers the persisted renderer locale", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "zh"),
      setItem: vi.fn(),
    });
    vi.stubGlobal("navigator", { language: "en-US" });

    expect(getDesktopLocale()).toBe("zh");
    expect(getDesktopLocaleHeaders()).toEqual({ "accept-language": "zh" });
  });

  it("normalizes the browser language when no preference is stored", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    vi.stubGlobal("document", { documentElement: { lang: "en" } });
    vi.stubGlobal("navigator", { language: "zh-CN" });

    expect(getDesktopLocale()).toBe("zh");
  });
});
