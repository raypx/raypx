/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vite-plus/test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { createNoopAnalytics } from "@raypx-kit/analytics";
import { AnalyticsApplication } from "../../src/client/application";
import type { AnalyticsConsent } from "../../src/index";

afterEach(cleanup);
it.each(["web", "desktop"] as const)(
  "shares consent-gated, sanitized page reporting on %s",
  async (surface) => {
    let restore!: (consent: AnalyticsConsent) => void;
    const reading = new Promise<AnalyticsConsent>((resolve) => {
      restore = resolve;
    });
    const client = { ...createNoopAnalytics(), capture: vi.fn() };
    const store = { read: () => reading, write: async () => true };
    const app = (path: string) => (
      <BrowserLanguageProvider initialPreference="en">
        <AnalyticsApplication
          client={client}
          store={store}
          configured
          surface={surface}
          path={path}
        >
          content
        </AnalyticsApplication>
      </BrowserLanguageProvider>
    );
    const view = render(app("/"));
    expect(client.capture).not.toHaveBeenCalled();
    restore({ usage: true, errors: false });
    await waitFor(() => expect(client.capture).toHaveBeenCalledWith("app_opened"));
    expect(client.capture).toHaveBeenCalledWith("page_viewed", {
      page: surface === "web" ? "account" : "files",
    });
    view.rerender(app("/tasks/private-task-id"));
    await waitFor(() =>
      expect(client.capture).toHaveBeenLastCalledWith("page_viewed", { page: "other" }),
    );
    view.rerender(app("/another-private-value"));
    expect(client.capture.mock.calls.filter(([name]) => name === "app_opened")).toHaveLength(1);
    expect(client.capture.mock.calls.filter(([name]) => name === "page_viewed")).toHaveLength(2);
    expect(JSON.stringify(client.capture.mock.calls)).not.toContain("private-task-id");
  },
);

it("keeps page capture disabled when preferences are off", async () => {
  const client = { ...createNoopAnalytics(), capture: vi.fn() };
  const read = vi.fn(async () => ({ usage: false, errors: false }));
  render(
    <BrowserLanguageProvider initialPreference="en">
      <AnalyticsApplication
        client={client}
        store={{ read, write: async () => true }}
        configured
        surface="web"
        path="/tasks"
      >
        content
      </AnalyticsApplication>
    </BrowserLanguageProvider>,
  );
  await waitFor(() => expect(read).toHaveBeenCalled());
  expect(client.capture).not.toHaveBeenCalled();
});
