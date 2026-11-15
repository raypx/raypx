/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserI18n } from "@raypx/i18n/browser";
import commonEn from "@raypx/i18n/messages/en";
import commonZh from "@raypx/i18n/messages/zh";
import en from "../../locales/en/index.js";
import zh from "../../locales/zh/index.js";
import { accessForRole } from "../access.js";
import { SetupChecklist } from "./setup-checklist.js";

const destinations = {
  model: "#settings/models",
  sandbox: "/admin/settings#sandbox",
  mail: "/admin/settings#email",
};
const { BrowserLanguageProvider } = createBrowserI18n({
  en: { ...commonEn, ...en },
  zh: { ...commonZh, ...zh },
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it.each(["en", "zh"] as const)(
  "shows three current states and configuration actions in %s",
  async (locale) => {
    const copy = { en, zh }[locale].access.setup;
    const configure = vi.fn();
    const port = {
      access: async () => accessForRole("admin", "admin"),
      status: async () => ({ model: true, sandbox: false, mail: false }),
    };
    const view = render(
      <BrowserLanguageProvider initialPreference={locale} restorePreference={false}>
        <SetupChecklist
          destinations={destinations}
          port={port}
          origin="https://a.example.test"
          accountId="admin"
          onConfigure={configure}
        />
      </BrowserLanguageProvider>,
    );
    await screen.findByRole("region", { name: copy.title });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(copy.required)).toBeDefined();
    expect(screen.getAllByText(copy.optional)).toHaveLength(2);
    expect(screen.getByText(copy.configured)).toBeDefined();
    expect(screen.getAllByText(copy.notConfigured)).toHaveLength(2);
    for (const item of ["model", "sandbox", "mail"] as const) {
      expect(screen.getByRole("link", { name: copy[item] }).getAttribute("href")).toBe(
        destinations[item],
      );
      fireEvent.click(screen.getByRole("link", { name: copy[item] }));
      expect(configure).toHaveBeenLastCalledWith(item);
    }
    fireEvent.click(screen.getByRole("button", { name: copy.dismiss }));
    expect(screen.queryByRole("region")).toBeNull();
    view.unmount();
    render(
      <BrowserLanguageProvider initialPreference={locale} restorePreference={false}>
        <SetupChecklist
          destinations={destinations}
          port={port}
          origin="https://a.example.test"
          accountId="admin"
          onConfigure={configure}
        />
      </BrowserLanguageProvider>,
    );
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  },
);
it("removes the checklist when a focused refresh finds every item configured", async () => {
  const port = {
    access: async () => accessForRole("admin", "admin"),
    status: vi.fn(async () => ({ model: false, sandbox: false, mail: false })),
  };
  render(
    <BrowserLanguageProvider initialPreference="en" restorePreference={false}>
      <SetupChecklist
        destinations={destinations}
        port={port}
        origin="https://a.example.test"
        accountId="admin"
        onConfigure={() => {}}
      />
    </BrowserLanguageProvider>,
  );
  await screen.findByRole("region");
  port.status.mockResolvedValue({ model: true, sandbox: true, mail: true });
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
});

it.each(["en", "zh"] as const)(
  "shows consequences only for unconfigured items as status changes in %s",
  async (locale) => {
    const copy = { en, zh }[locale].access.setup;
    const port = {
      access: async () => accessForRole("admin", "admin"),
      status: vi.fn(async () => ({ model: true, sandbox: false, mail: false })),
    };
    render(
      <BrowserLanguageProvider initialPreference={locale} restorePreference={false}>
        <SetupChecklist
          destinations={destinations}
          port={port}
          origin="https://a.example.test"
          accountId="admin"
          onConfigure={() => {}}
        />
      </BrowserLanguageProvider>,
    );
    await screen.findByRole("region", { name: copy.title });
    expect(screen.queryByText(copy.modelHint)).toBeNull();
    expect(screen.getByText(copy.sandboxHint)).toBeDefined();
    expect(screen.getByText(copy.mailHint)).toBeDefined();
    port.status.mockResolvedValue({ model: false, sandbox: true, mail: true });
    fireEvent(window, new Event("focus"));
    await screen.findByText(copy.modelHint);
    expect(screen.queryByText(copy.sandboxHint)).toBeNull();
    expect(screen.queryByText(copy.mailHint)).toBeNull();
    expect(screen.getAllByText(copy.configured)).toHaveLength(2);
  },
);
