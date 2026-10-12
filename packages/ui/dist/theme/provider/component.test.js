import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ThemeProvider, parseTheme, useTheme } from "..";
afterEach(() => cleanup());
function ThemeProbe() {
    const { resolvedTheme, setTheme, theme } = useTheme();
    return (_jsxs("div", { children: [_jsx("span", { "data-testid": "theme", children: theme }), _jsx("span", { "data-testid": "resolved-theme", children: resolvedTheme }), _jsx("button", { onClick: () => setTheme("dark"), type: "button", children: "Dark" }), _jsx("button", { onClick: () => setTheme("light"), type: "button", children: "Light" })] }));
}
describe("theme provider", () => {
    beforeEach(() => {
        document.documentElement.className = "";
        document.documentElement.removeAttribute("data-theme");
        document.documentElement.style.colorScheme = "";
        window.localStorage.clear();
    });
    it("falls back when a stored theme is invalid", () => {
        expect(parseTheme("sepia", "dark")).toBe("dark");
        expect(parseTheme(null, "system")).toBe("system");
    });
    it("applies an explicit theme and supports switching without persistence", async () => {
        const user = userEvent.setup();
        render(_jsx(ThemeProvider, { disableScript: true, disableTransitionOnChange: true, initialTheme: "dark", storageKey: false, children: _jsx(ThemeProbe, {}) }));
        await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark"));
        expect(document.documentElement).toHaveAttribute("data-theme", "dark");
        expect(document.documentElement).toHaveClass("dark");
        expect(document.querySelector("script")).toBeNull();
        await user.click(screen.getByRole("button", { name: "Light" }));
        expect(screen.getByTestId("theme")).toHaveTextContent("light");
        expect(document.documentElement).toHaveAttribute("data-theme", "light");
        expect(document.documentElement).toHaveClass("light");
        expect(document.documentElement).not.toHaveClass("dark");
    });
    it("resolves system theme from the media query", async () => {
        const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation(() => ({
            matches: true,
            media: "(prefers-color-scheme: dark)",
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        render(_jsx(ThemeProvider, { disableScript: true, initialTheme: "system", storageKey: false, children: _jsx(ThemeProbe, {}) }));
        await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark"));
        expect(document.documentElement).toHaveAttribute("data-theme", "dark");
        matchMedia.mockRestore();
    });
    it("keeps switching usable when localStorage is unavailable", async () => {
        const user = userEvent.setup();
        const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage unavailable");
        });
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("storage unavailable");
        });
        render(_jsx(ThemeProvider, { disableScript: true, initialTheme: "light", storageKey: "voidmix-test-theme", children: _jsx(ThemeProbe, {}) }));
        await user.click(screen.getByRole("button", { name: "Dark" }));
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
        getItem.mockRestore();
        setItem.mockRestore();
    });
});
//# sourceMappingURL=component.test.js.map