import { BrowserLanguageProvider } from "../../../i18n.js";
import { expect, it, vi } from "vite-plus/test";
import { fireEvent, render, screen } from "@testing-library/react";

import { SessionBoundary } from "./session-boundary.js";

const mocks = vi.hoisted(() => ({ refetch: vi.fn() }));
vi.mock("../client.js", () => ({
  apiUrl: "https://api.example.test",
  authClient: {
    useSession: () => ({
      data: null,
      isPending: false,
      error: new Error("private error"),
      refetch: mocks.refetch,
    }),
  },
}));
it.each(["en", "zh"] as const)(
  "translates session failures and keeps private views gated in %s",
  (locale) => {
    render(
      <BrowserLanguageProvider initialPreference={locale} restorePreference={false}>
        <SessionBoundary guest={<p>Guest</p>}>{() => <p>Private</p>}</SessionBoundary>
      </BrowserLanguageProvider>,
    );
    expect(
      screen.getByText(locale === "en" ? "Unable to verify your session." : "无法验证登录状态。"),
    ).toBeVisible();
    expect(screen.queryByText("Private")).toBeNull();
    expect(screen.queryByText("private error")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Try again" : "重试" }));
    expect(mocks.refetch).toHaveBeenCalled();
  },
);
