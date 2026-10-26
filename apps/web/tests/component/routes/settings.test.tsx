/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { ThemeProvider } from "@raypx/ui/themes";
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
vi.mock("../../../src/features/auth/client", () => ({
  apiUrl: "https://api.example.test",
  authClient: { useSession: () => ({ data: null, isPending: false, error: null }) },
}));
import { Route } from "../../../src/routes/(app)/settings";

const SettingsPage = Route.options.component!;

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});
describe("device settings", () => {
  it("persists appearance and language independently of any account", async () => {
    const router = createRouter({
      routeTree: createRootRoute({ component: SettingsPage }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await router.load();
    render(
      <ThemeProvider>
        <BrowserLanguageProvider>
          <RouterProvider router={router} />
        </BrowserLanguageProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("combobox", { name: "Language" }));
    const chinese = await screen.findByRole("option", { name: "简体中文" });
    fireEvent.pointerDown(chinese, { pointerType: "mouse" });
    fireEvent.click(chinese);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "按你的习惯设置" })).toBeTruthy(),
    );
    expect(localStorage.getItem("raypx_locale")).toBe("zh");
    expect(document.documentElement.lang).toBe("zh");
  });
});
