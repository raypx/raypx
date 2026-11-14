import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
import { ActivityTime } from "./activity-time.js";

const { BrowserLanguageProvider } = createBrowserI18n<typeof en>({ en, zh });
afterEach(() => vi.useRealTimers());

it.each([
  ["en", "Active 5 min. ago", "Active 6 min. ago", "No activity yet"],
  ["zh", "5分钟前活跃", "6分钟前活跃", "暂无活动"],
] as const)(
  "updates only the activity label at minute precision in %s",
  async (language, first, next, empty) => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    const parentRender = vi.fn();
    function List() {
      parentRender();
      return (
        <>
          <ActivityTime value="2026-11-14T11:55:00Z" />
          <ActivityTime value={null} />
        </>
      );
    }
    render(
      <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
        <List />
      </BrowserLanguageProvider>,
    );
    await screen.findByText(first);
    await screen.findByText(empty);
    const renders = parentRender.mock.calls.length;
    await act(() => vi.advanceTimersByTime(60_000));
    await screen.findByText(next);
    expect(parentRender).toHaveBeenCalledTimes(renders);
  },
);
