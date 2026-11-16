/** @vitest-environment happy-dom */
import { BrowserLanguageProvider } from "../../i18n.js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TestEmail } from "./components/test-email.js";
import { ConfigurationForm, ConfigurationSettings } from "./components/settings.js";
import { configurationClient, type Configuration } from "./client.js";

const auth = vi.hoisted(() => ({ error: null as Error | null, refetch: vi.fn() }));
vi.mock("../auth/client.js", () => ({
  apiOrigin: () => "https://api.example.test",
  apiFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  authClient: {
    useSession: () => ({
      data: auth.error ? null : { user: { id: "admin" } },
      isPending: false,
      error: auth.error,
      refetch: auth.refetch,
    }),
  },
}));
vi.mock("./client.js", async (original) => ({
  ...(await original<typeof import("./client.js")>()),
  configurationClient: {
    get: vi.fn(),
    update: vi.fn(),
    storage: vi.fn(),
    updateStorage: vi.fn(),
    testMail: vi.fn(),
    sandbox: vi.fn(),
    updateSandbox: vi.fn(),
    testSandbox: vi.fn(),
  },
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
    expect(screen.getByRole("switch", { name: "Open sign-ups" })).toHaveAttribute(
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
  expect(await screen.findByRole("alert")).toHaveTextContent("Only a deployment administrator");
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

it("keeps site edits while rotating write-only storage credentials", async () => {
  vi.spyOn(configurationClient, "get").mockResolvedValue(config);
  const storage = {
    values: {
      endpoint: "https://s3.us-east-1.amazonaws.com",
      bucket: "raypx-private",
      region: "us-east-1",
      enabled: true,
    },
    revision: 2,
    updatedAt: null,
  };
  const read = vi.spyOn(configurationClient, "storage").mockResolvedValue(storage);
  const save = vi.spyOn(configurationClient, "updateStorage").mockResolvedValue({
    ...storage,
    revision: 3,
  });
  page(<ConfigurationSettings />);
  fireEvent.change(await screen.findByLabelText("Site name"), { target: { value: "My draft" } });
  expect(read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "Object storage" }));
  const accessKey = await screen.findByLabelText("Access key ID");
  const secret = screen.getByLabelText("Secret access key");
  expect(accessKey).toHaveValue("");
  expect(secret).toHaveAttribute("type", "password");
  fireEvent.change(accessKey, { target: { value: "rotated-id" } });
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  fireEvent.change(secret, { target: { value: "rotated-secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(secret).toHaveValue(""));
  expect(save).toHaveBeenCalledExactlyOnceWith({
    revision: 2,
    values: storage.values,
    credentials: { accessKeyId: "rotated-id", secretAccessKey: "rotated-secret" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Site" }));
  expect(screen.getByLabelText("Site name")).toHaveValue("My draft");
});

it("tests only saved mail settings and shows a clear delivery result", async () => {
  const send = vi.spyOn(configurationClient, "testMail").mockResolvedValue({ sent: true });
  page(<TestEmail disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Send test email" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "The mail service accepted the test email. Check your inbox.",
  );
  expect(send).toHaveBeenCalledExactlyOnceWith({ locale: "en" });
});

it("saves write-only sandbox credentials, tests saved settings, and keeps other drafts", async () => {
  vi.spyOn(configurationClient, "get").mockResolvedValue(config);
  const sandbox = {
    values: { provider: "docker", url: "https://supervisor.example.test", screen: false },
    hasCredential: true,
    revision: 1,
    updatedAt: null,
  } as const;
  vi.spyOn(configurationClient, "sandbox").mockResolvedValue(sandbox);
  const save = vi
    .spyOn(configurationClient, "updateSandbox")
    .mockResolvedValue({ ...sandbox, revision: 2 });
  const test = vi.spyOn(configurationClient, "testSandbox").mockResolvedValue({
    status: "connected",
    untrustedTenants: true,
    runtime: "runsc",
    screen: true,
  });
  page(<ConfigurationSettings />);
  fireEvent.change(await screen.findByLabelText("Site name"), { target: { value: "Site draft" } });
  fireEvent.click(screen.getByRole("tab", { name: "Sandbox" }));
  const credential = await screen.findByLabelText("Supervisor credential");
  expect(credential).toHaveAttribute("type", "password");
  expect(credential).toHaveValue("");
  fireEvent.change(credential, {
    target: { value: "fake-new-supervisor-credential-32-characters" },
  });
  expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(credential).toHaveValue(""));
  expect(save).toHaveBeenCalledWith({
    values: sandbox.values,
    revision: 1,
    credential: "fake-new-supervisor-credential-32-characters",
  });
  fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
  expect(
    await screen.findByText(/Connected · Untrusted tenants · runsc · Screen available/),
  ).toBeTruthy();
  expect(test).toHaveBeenCalledExactlyOnceWith({});
  fireEvent.click(screen.getByRole("tab", { name: "Site" }));
  expect(screen.getByLabelText("Site name")).toHaveValue("Site draft");
});

it("saves E2B with only the key and identifies an older Sandbox API", async () => {
  vi.spyOn(configurationClient, "get").mockResolvedValue(config);
  const sandbox = {
    values: { provider: "e2b", url: null, screen: false },
    hasCredential: false,
    revision: 1,
    updatedAt: null,
  } as const;
  vi.spyOn(configurationClient, "sandbox").mockResolvedValue(sandbox);
  const save = vi.spyOn(configurationClient, "updateSandbox").mockRejectedValue({
    code: "BAD_REQUEST",
    data: { issues: [{ path: ["values", "provider"], values: ["none", "docker"] }] },
  });
  page(<ConfigurationSettings />);
  fireEvent.click(screen.getByRole("tab", { name: "Sandbox" }));
  const key = await screen.findByLabelText("E2B API key");
  expect(key).toHaveAttribute("type", "password");
  expect(screen.queryByLabelText(/template|supervisor base URL|offer screen/i)).toBeNull();
  const credential = "fake-e2b-key-with-at-least-32-characters";
  fireEvent.change(key, { target: { value: credential } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Update the Raypx API to a version that supports E2B",
  );
  expect(save).toHaveBeenCalledExactlyOnceWith({ values: sandbox.values, credential, revision: 1 });
});
