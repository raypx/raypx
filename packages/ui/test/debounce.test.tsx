import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { useDebouncedValue } from "@raypx/ui/hooks/debounce";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("SSR returns its input without starting timers", () => {
  vi.useFakeTimers();
  function Value() {
    return <output>{useDebouncedValue("initial", 100)}</output>;
  }
  expect(renderToString(<Value />)).toContain("initial");
  expect(vi.getTimerCount()).toBe(0);
});

test("rapid changes publish only the latest value after the quiet interval", () => {
  vi.useFakeTimers();
  const { result, rerender, unmount } = renderHook(({ value }) => useDebouncedValue(value, 100), {
    initialProps: { value: "a" },
    reactStrictMode: true,
  });
  rerender({ value: "b" });
  act(() => {
    vi.advanceTimersByTime(99);
  });
  expect(result.current).toBe("a");
  rerender({ value: "c" });
  act(() => {
    vi.advanceTimersByTime(99);
  });
  expect(result.current).toBe("a");
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(result.current).toBe("c");
  rerender({ value: "d" });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test("delay changes replace the timer and function values are not invoked", () => {
  vi.useFakeTimers();
  const first = vi.fn<() => string>(() => "first");
  const next = vi.fn<() => string>(() => "next");
  const { result, rerender } = renderHook(({ value, delay }) => useDebouncedValue(value, delay), {
    initialProps: { value: first, delay: 100 },
  });
  expect(result.current).toBe(first);
  rerender({ value: next, delay: 200 });
  act(() => {
    vi.advanceTimersByTime(100);
  });
  expect(result.current).toBe(first);
  act(() => {
    vi.advanceTimersByTime(100);
  });
  expect(result.current).toBe(next);
  expect(first).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});
