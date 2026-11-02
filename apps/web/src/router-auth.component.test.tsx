/** @vitest-environment happy-dom */
import type { ReactNode } from "react";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
  type RootRouteOptions,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SyncDevice } from "@raypx/tasks";
import { accessForRole, type AccountRole } from "@raypx/account/access";
import { routeTree } from "./routeTree.gen.ts";

const mocks = vi.hoisted(() => ({
  role: "member" as AccountRole,
  access: vi.fn(),
  configurationGet: vi.fn(),
  registrationEnabled: true,
  sessionError: false,
  sessionPending: false,
  refetch: vi.fn(),
  session: null as null | {
    user: { id: string; name: string; email: string };
    session: { id: string };
  },
  tasks: vi.fn(async () => []),
  devices: vi.fn(async (): Promise<SyncDevice[]> => []),
  approvals: vi.fn(async () => []),
  create: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  signOut: vi.fn(),
  loadAccount: vi.fn(),
}));
vi.mock("./features/auth/client", () => ({
  webUrl: "https://raypx.example",
  apiUrl: "https://api.raypx.example",
  loadAccount: async () => ({ status: "signed-out" }),
  authClient: {
    useSession: () => ({
      data: mocks.session,
      isPending: mocks.sessionPending,
      error: mocks.sessionError ? new Error("offline") : null,
      refetch: mocks.refetch,
    }),
    getSession: async () => ({ data: mocks.session, error: null }),
    signIn: { email: mocks.signIn },
    signUp: { email: mocks.signUp },
    sendVerificationEmail: mocks.resend,
    requestPasswordReset: mocks.requestPasswordReset,
    resetPassword: mocks.resetPassword,
    signOut: mocks.signOut,
  },
}));
vi.mock("./features/configuration/client", () => ({
  configurationClient: { get: mocks.configurationGet },
  publicConfigurationQuery: () => ({
    queryKey: ["configuration", "public"],
    queryFn: async () => ({ siteName: "Raypx", registrationEnabled: mocks.registrationEnabled }),
    initialData: { siteName: "Raypx", registrationEnabled: mocks.registrationEnabled },
    staleTime: Infinity,
  }),
}));
vi.mock("./features/auth/access", async (original) => ({
  ...(await original<typeof import("./features/auth/access")>()),
  accountAccessQuery: (accountId: string | null) => ({
    queryKey: ["account-access", accountId],
    queryFn: mocks.access,
    enabled: Boolean(accountId),
    retry: false,
  }),
}));
vi.mock("./features/tasks/client", () => ({
  taskClient: {
    tasks: { list: mocks.tasks, create: mocks.create },
    devices: { list: mocks.devices },
    approvals: { list: mocks.approvals },
    subscribe: () => () => {},
  },
}));
vi.mock("./features/auth/account", () => ({
  loadAccount: mocks.loadAccount,
}));
vi.mock("./preferences", () => ({
  loadPreferences: () => ({ theme: "light", locale: "en", systemLocales: ["en"] }),
}));

const rootOptions = routeTree.options as typeof routeTree.options &
  Pick<RootRouteOptions, "shellComponent">;
const documentShell = rootOptions.shellComponent;
beforeAll(() => {
  // Component tests mount into happy-dom's existing document; keep the real route tree.
  rootOptions.shellComponent = ({ children }: { children: ReactNode }) => <>{children}</>;
});
afterAll(() => {
  if (documentShell) rootOptions.shellComponent = documentShell;
  else delete rootOptions.shellComponent;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.registrationEnabled = true;
  mocks.sessionError = false;
  mocks.sessionPending = false;
  mocks.session = null;
  mocks.tasks.mockResolvedValue([]);
  mocks.devices.mockResolvedValue([]);
  mocks.approvals.mockResolvedValue([]);
  sessionStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  mocks.loadAccount.mockResolvedValue({ status: "signed-out" });
  mocks.role = "member";
  mocks.access
    .mockReset()
    .mockImplementation(async () => accessForRole(mocks.role, mocks.session?.user.id ?? null));
  mocks.configurationGet.mockReset();
});

async function page(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [url] }),
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <BrowserLanguageProvider>
        <RouterProvider router={router} />
      </BrowserLanguageProvider>
    </QueryClientProvider>,
  );
  return router;
}

function signIn(role: AccountRole = "member", accountId = "user-1") {
  mocks.role = role;
  mocks.session = {
    user: { id: accountId, name: "Ada", email: "ada@example.test" },
    session: { id: "session-1" },
  };
  mocks.loadAccount.mockResolvedValue({ status: "signed-in", account: mocks.session.user });
}

it("renders the landing page without account or private workspace reads", async () => {
  mocks.sessionPending = true;
  const router = await page("/");
  expect(router.state.location.pathname).toBe("/");
  expect(screen.getByRole("heading", { name: "Remote sessions and approvals" })).toBeTruthy();
  expect(mocks.loadAccount).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.tasks).not.toHaveBeenCalled();
  expect(mocks.devices).not.toHaveBeenCalled();
  expect(mocks.approvals).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "Projects" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
});

describe("menu permissions", () => {
  it("keeps private menu links and their queries hidden for guests", async () => {
    await page("/projects");
    expect(screen.queryByRole("link", { name: "Waiting" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Automations" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Memory and templates" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Site settings" })).toBeNull();
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it.each(["/admin/settings", "/admin/settings/", "/ADMIN/SETTINGS"])(
    "shows member menus and blocks direct navigation to %s before private reads",
    async (path) => {
      signIn();
      await page(path);
      expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
      expect(await screen.findByRole("link", { name: "Automations" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "Memory and templates" })).toBeTruthy();
      expect(screen.queryByRole("link", { name: "Site settings" })).toBeNull();
      expect(mocks.configurationGet).not.toHaveBeenCalled();
    },
  );

  it("removes administrator navigation when the server downgrades the same account", async () => {
    signIn("admin");
    const router = await page("/approvals");
    expect(await screen.findByRole("link", { name: "Site settings" })).toBeTruthy();
    mocks.role = "member";
    await router.options.context.queryClient.invalidateQueries({ queryKey: ["account-access"] });
    await waitFor(() => expect(screen.queryByRole("link", { name: "Site settings" })).toBeNull());
  });

  it("fails closed on permission lookup errors and lets the user retry", async () => {
    signIn("admin");
    mocks.access.mockRejectedValue(new Error("private diagnostic"));
    await page("/admin/settings");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to verify permissions");
    expect(screen.queryByRole("link", { name: "Site settings" })).toBeNull();
    expect(screen.queryByText("private diagnostic")).toBeNull();
    expect(mocks.configurationGet).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue(accessForRole("member", "user-1"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You do not have permission to access this page.")).toBeTruthy();
  });

  it("never carries administrator navigation into another account while grants are pending", async () => {
    signIn("admin");
    const router = await page("/projects");
    expect(await screen.findByRole("link", { name: "Site settings" })).toBeTruthy();
    signIn("member", "user-2");
    mocks.access.mockImplementation(() => new Promise(() => {}));
    await router.navigate({ to: "/admin/settings" });
    await waitFor(() => expect(screen.queryByRole("link", { name: "Site settings" })).toBeNull());
    expect(mocks.configurationGet).not.toHaveBeenCalled();
  });
});

describe("authentication routes", () => {
  it("replaces closed registration with a sign-in link", async () => {
    mocks.registrationEnabled = false;
    await page("/signup");
    expect(screen.getByRole("heading", { name: "Registration is closed" })).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
  it("submits the canonical name and sends verification back to Web", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });
    await page("/signup");
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Ada",
          email: "ada@example.test",
          callbackURL: "https://raypx.example/verify-email?verified=1",
        }),
      ),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("renders a translated error instead of server diagnostic prose", async () => {
    mocks.signIn.mockResolvedValue({
      error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "private diagnostic" },
    });
    await page("/login");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "incorrect" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The email or password is incorrect.",
    );
    expect(screen.queryByText("private diagnostic")).toBeNull();
    expect(screen.getByRole("link", { name: "Resend verification email" })).toBeTruthy();
  });

  it("lets guests compose without reading private data", async () => {
    const router = await page("/tasks");
    expect(router.state.location.pathname).toBe("/tasks");
    expect(await screen.findByRole("button", { name: "Sign in to send" })).toBeTruthy();
    expect(mocks.tasks).not.toHaveBeenCalled();
    expect(mocks.devices).not.toHaveBeenCalled();
    expect(mocks.approvals).not.toHaveBeenCalled();
  });

  it("keeps application routes when the API is unavailable", async () => {
    mocks.loadAccount.mockResolvedValue({ status: "unavailable" });
    const router = await page("/projects");
    expect(router.state.location.pathname).toBe("/projects");
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it.each(["/tasks", "/approvals", "/settings"])(
    "keeps session failures retryable on %s without private reads",
    async (path) => {
      mocks.sessionError = true;
      await page(path);
      fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
      expect(mocks.refetch).toHaveBeenCalledTimes(1);
      expect(mocks.tasks).not.toHaveBeenCalled();
      expect(mocks.devices).not.toHaveBeenCalled();
      expect(mocks.approvals).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Sign in to send" })).toBeNull();
    },
  );

  it("waits for session resolution before mounting private task queries", async () => {
    mocks.sessionPending = true;
    await page("/tasks");
    expect(mocks.tasks).not.toHaveBeenCalled();
    expect(mocks.devices).not.toHaveBeenCalled();
    expect(mocks.approvals).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Sign in to send" })).toBeNull();
  });

  it("returns to the guest editor with the draft after cancelling login", async () => {
    const router = await page("/tasks?from=cancel");
    fireEvent.change(await screen.findByLabelText("What should the agent do?"), {
      target: { value: "Do not lose this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to send" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    fireEvent.click(screen.getByRole("link", { name: "Back to browsing" }));
    await waitFor(() =>
      expect(screen.getByLabelText("What should the agent do?")).toHaveValue(
        "Do not lose this draft",
      ),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("opens projects after successful sign-in without a return destination", async () => {
    mocks.signIn.mockImplementation(async () => {
      mocks.loadAccount.mockResolvedValue({
        status: "signed-in",
        account: { id: "user-1", email: "ada@example.test", name: "Ada" },
      });
      return { data: {}, error: null };
    });
    const router = await page("/login");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
    await waitFor(() => expect(screen.queryByLabelText("Password")).toBeNull());
  });

  it("restores a guest draft after failed then successful sign-in without sending", async () => {
    const deviceId = crypto.randomUUID(),
      projectId = crypto.randomUUID();
    mocks.devices.mockResolvedValue([
      {
        id: deviceId,
        name: "Remote computer",
        platform: "darwin",
        appVersion: "1.0.0",
        epoch: 1,
        revoked: false,
        online: true,
        lastSeenAt: null,
        projects: [{ id: projectId, name: "Remote project", providers: ["codex"], dirty: false }],
        capabilities: [
          { provider: "codex", available: true, reason: "ready", version: "test", inputModes: [] },
        ],
      },
    ]);
    const router = await page("/tasks?from=guest");
    const prompt = "Guest draft 中😀";
    fireEvent.change(await screen.findByLabelText("What should the agent do?"), {
      target: { value: prompt },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to send" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.searchStr).not.toContain(encodeURIComponent(prompt));
    mocks.signIn.mockResolvedValueOnce({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "incorrect" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The email or password is incorrect.",
    );
    mocks.signIn.mockImplementationOnce(async () => {
      mocks.session = {
        user: { id: "user-1", name: "Ada", email: "ada@example.test" },
        session: { id: "session-1" },
      };
      mocks.loadAccount.mockResolvedValue({ status: "signed-in", account: mocks.session.user });
      return { data: {}, error: null };
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/tasks"));
    fireEvent.click(await screen.findByRole("button", { name: "Remote project" }));
    await waitFor(() =>
      expect(screen.getByLabelText("What should the agent do?")).toHaveValue(prompt),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(router.state.location.search).toMatchObject({ project: projectId, device: deviceId });
  });

  it("preserves the page through registration and password recovery links", async () => {
    const router = await page("/login?returnTo=%2Fapprovals");
    fireEvent.click(screen.getByRole("link", { name: "Create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/signup"));
    expect(router.state.location.search).toMatchObject({ returnTo: "/approvals" });
    fireEvent.click(screen.getByRole("link", { name: "Sign in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    fireEvent.click(screen.getByRole("link", { name: "Forgot password?" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/forgot-password"));
    expect(router.state.location.search).toMatchObject({ returnTo: "/approvals" });
  });

  it("preserves the destination in verification and reset emails", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });
    const router = await page("/signup?returnTo=%2Ftasks%3Ffrom%3Dguest");
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackURL:
            "https://raypx.example/verify-email?verified=1&returnTo=%2Ftasks%3Ffrom%3Dguest",
        }),
      ),
    );
    await router.navigate({ to: "/forgot-password", search: { returnTo: "/tasks?from=guest" } });
    mocks.requestPasswordReset.mockResolvedValue({ data: {}, error: null });
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send reset link" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.requestPasswordReset).toHaveBeenCalledWith(
        expect.objectContaining({
          redirectTo: "https://raypx.example/reset-password?returnTo=%2Ftasks%3Ffrom%3Dguest",
        }),
      ),
    );
  });

  it("submits the reset-link token and replacement password without an email field", async () => {
    mocks.resetPassword.mockResolvedValue({ data: {}, error: null });
    await page("/reset-password?token=reset-token");
    expect(screen.queryByLabelText("Email address")).toBeNull();
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "replacement-password" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Reset password" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.resetPassword).toHaveBeenCalledWith({
        token: "reset-token",
        newPassword: "replacement-password",
        fetchOptions: { headers: { "Accept-Language": "en" } },
      }),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("preserves the email query when requesting a password reset", async () => {
    mocks.requestPasswordReset.mockResolvedValue({ data: {}, error: null });
    await page("/forgot-password?email=ada%2Bnewsletter%40example.test");
    expect(screen.getByLabelText("Email address")).toHaveValue("ada+newsletter@example.test");
    fireEvent.submit(screen.getByRole("button", { name: "Send reset link" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
        email: "ada+newsletter@example.test",
        redirectTo: "https://raypx.example/reset-password",
        fetchOptions: { headers: { "Accept-Language": "en" } },
      }),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("keeps the login form available when a verification query is present", async () => {
    await page("/login?verified=1");
    expect(screen.getByLabelText("Email address")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows the verification result without a resend form for verified=1", async () => {
    await page("/verify-email?verified=1");
    expect(screen.getByText("Your email is verified. You can sign in now.")).toBeTruthy();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.queryByRole("button", { name: "Resend verification email" })).toBeNull();
  });

  it("shows an invalid-link notice whenever the error query is present", async () => {
    await page("/verify-email?error");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This link is invalid or has expired. Request a new email.",
    );
    expect(screen.getByLabelText("Email address")).toBeTruthy();
  });

  it("clears the form and auth error when navigating between authentication routes", async () => {
    mocks.signIn.mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    const router = await page("/login");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "incorrect" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/signup"));
    expect(await screen.findByLabelText("Your name")).toBeTruthy();
    expect(screen.getByLabelText("Email address")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
