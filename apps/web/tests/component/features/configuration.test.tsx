/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  ConfigurationForm,
  ConfigurationSettings,
} from "../../../src/features/configuration/components/settings";
import {
  configurationClient,
  type Configuration,
} from "../../../src/features/configuration/client";

const auth = vi.hoisted(() => ({ error: null as Error | null, refetch: vi.fn() }));
vi.mock("../../../src/features/auth/client", () => ({
  apiUrl: "https://api.example.test",
  authClient: {
    useSession: () => ({
      data: auth.error ? null : { user: { id: "admin" } },
      isPending: false,
      error: auth.error,
      refetch: auth.refetch,
    }),
  },
}));
vi.mock("../../../src/features/configuration/client", async (original) => ({
  ...(await original<typeof import("../../../src/features/configuration/client")>()),
  configurationClient: { get: vi.fn(), update: vi.fn() },
}));
const config: Configuration = {
  values: { siteName: "Raypx", registrationEnabled: true, cleanupEnabled: true },
  revision: 1,
  updatedAt: null,
  deployment: { jobsEnabled: false, mailConfigured: false },
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  auth.error = null;
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});

function page(component = <ConfigurationForm configuration={config} accountId="admin" />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BrowserLanguageProvider>{component}</BrowserLanguageProvider>
    </QueryClientProvider>,
  );
}

it("saves deliberate edits and explains the deployment gate", async () => {
  const save = vi.spyOn(configurationClient, "update").mockResolvedValue({
    values: { ...config.values, siteName: "Team" },
    revision: 2,
    updatedAt: new Date().toISOString(),
  });
  page();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(screen.getByText(/Set JOBS_ENABLED=true/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Team" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Changes saved.");
  expect(save).toHaveBeenCalledWith({
    values: { ...config.values, siteName: "Team" },
    revision: 1,
  });
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

it("preserves edits after a conflict and keeps them when loading the latest revision", async () => {
  vi.spyOn(configurationClient, "update").mockRejectedValue({
    code: "CONFLICT",
    message: "private diagnostic",
  });
  vi.spyOn(configurationClient, "get").mockResolvedValue({
    ...config,
    values: {
      ...config.values,
      siteName: "Other admin",
      registrationEnabled: !config.values.registrationEnabled,
    },
    revision: 2,
  });
  page();
  fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "My draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Another administrator");
  expect(screen.getByLabelText("Site name")).toHaveValue("My draft");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(screen.queryByText("private diagnostic")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load latest and keep my edits" }));
  // The other administrator's untouched field arrives; this administrator's edit stays.
  await waitFor(() =>
    expect(screen.getByRole("switch", { name: "Open registration" })).toHaveAttribute(
      "aria-checked",
      String(!config.values.registrationEnabled),
    ),
  );
  expect(screen.getByLabelText("Site name")).toHaveValue("My draft");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
});

it("keeps failed saves editable and supports discarding changes", async () => {
  vi.spyOn(configurationClient, "update").mockRejectedValue(new Error("private connection string"));
  page();
  fireEvent.change(screen.getByLabelText("Site name"), { target: { value: "Draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Site settings are unavailable");
  expect(screen.getByLabelText("Site name")).toHaveValue("Draft");
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.getByLabelText("Site name")).toHaveValue("Raypx");
});

it("does not render settings controls for a non-administrator", async () => {
  vi.spyOn(configurationClient, "get").mockRejectedValue({ code: "FORBIDDEN" });
  page(<ConfigurationSettings />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Only a verified administrator");
  expect(screen.queryByLabelText("Site name")).toBeNull();
});

it("reports session lookup failure as unavailability rather than a permission denial", async () => {
  auth.error = new Error("private database error");
  page(<ConfigurationSettings />);
  expect(screen.getByRole("alert")).toHaveTextContent("Site settings are unavailable");
  expect(screen.queryByLabelText("Site name")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(auth.refetch).toHaveBeenCalledOnce();
});
