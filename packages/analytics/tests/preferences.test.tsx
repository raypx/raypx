import { afterEach, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { createNoopAnalytics } from "@raypx-kit/analytics";
import { AnalyticsPreferencesProvider, AnalyticsIdentity } from "../src/client/provider";
import { AnalyticsSettings } from "../src/client/settings";
import type { AnalyticsConsent } from "../src/index";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
function setup(
  initial: AnalyticsConsent = { usage: false, errors: false },
  save = true,
  read: () => AnalyticsConsent | Promise<AnalyticsConsent> = () => initial,
) {
  const client = {
    ...createNoopAnalytics(),
    setConsent: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  };
  const store = { read, write: vi.fn(async () => save) };
  const view = render(
    <StrictMode>
      <BrowserLanguageProvider initialPreference="en">
        <AnalyticsPreferencesProvider client={client} store={store} configured>
          <AnalyticsIdentity client={client} accountId="account-a" />
          <AnalyticsSettings />
        </AnalyticsPreferencesProvider>
      </BrowserLanguageProvider>
    </StrictMode>,
  );
  return { client, store, view };
}
it("keeps separate opt-in categories and restores their durable choice", async () => {
  const { client, store } = setup();
  const usage = screen.getByRole("switch", { name: "Usage statistics" }),
    errors = screen.getByRole("switch", { name: "Error reports" });
  await waitFor(() => expect(usage.getAttribute("aria-disabled")).not.toBe("true"));
  expect(usage.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(usage);
  await waitFor(() => expect(usage.getAttribute("aria-checked")).toBe("true"));
  fireEvent.click(errors);
  await waitFor(() => expect(errors.getAttribute("aria-checked")).toBe("true"));
  fireEvent.click(usage);
  await waitFor(() => expect(usage.getAttribute("aria-checked")).toBe("false"));
  expect(store.write).toHaveBeenLastCalledWith({ usage: false, errors: true });
  expect(client.setConsent).toHaveBeenLastCalledWith({ usage: false, errors: true });
});
it("does not enable capture when preference storage fails and resets identity on unmount", async () => {
  const { client, view, store } = setup(undefined, false);
  const usage = screen.getByRole("switch", { name: "Usage statistics" });
  await waitFor(() => expect(usage.getAttribute("aria-disabled")).not.toBe("true"));
  fireEvent.click(usage);
  await screen.findByRole("alert");
  expect(usage.getAttribute("aria-checked")).toBe("false");
  expect(client.setConsent).not.toHaveBeenCalledWith({ usage: true, errors: false });
  store.write.mockResolvedValueOnce(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry saving" }));
  await waitFor(() => expect(usage.getAttribute("aria-checked")).toBe("true"));
  view.unmount();
  expect(client.reset).toHaveBeenCalled();
});
it("keeps capture disabled until the authoritative async read completes", async () => {
  let resolve!: (value: AnalyticsConsent) => void;
  const result = new Promise<AnalyticsConsent>((done) => {
    resolve = done;
  });
  const { client } = setup(undefined, true, () => result);
  const usage = screen.getByRole("switch", { name: "Usage statistics" });
  expect(usage.getAttribute("aria-disabled")).toBe("true");
  expect(client.setConsent).not.toHaveBeenCalledWith({ usage: true, errors: true });
  resolve({ usage: true, errors: true });
  await waitFor(() => expect(usage.getAttribute("aria-checked")).toBe("true"));
  expect(client.setConsent).toHaveBeenLastCalledWith({ usage: true, errors: true });
});
it("does not restore a late async read after unmount", async () => {
  let resolve!: (value: AnalyticsConsent) => void;
  const result = new Promise<AnalyticsConsent>((done) => {
    resolve = done;
  });
  const { client, view } = setup(undefined, true, () => result);
  view.unmount();
  resolve({ usage: true, errors: true });
  await result;
  await Promise.resolve();
  expect(client.setConsent).not.toHaveBeenCalledWith({ usage: true, errors: true });
});
