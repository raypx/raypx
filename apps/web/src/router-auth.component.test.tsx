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
import { ThemeProvider } from "@raypx/ui/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SyncDevice } from "@raypx/contracts/tasks";
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
  social: vi.fn(async () => ({ error: null })),
  providers: vi.fn(async () => ({ data: { providers: ["google", "github"] }, error: null })),
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
    getSession: async () => ({
      data: mocks.session,
      error: mocks.sessionError ? { code: "OFFLINE" } : null,
    }),
    $fetch: mocks.providers,
    signIn: { email: mocks.signIn, social: mocks.social },
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
  localStorage.setItem("theme", "system");
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
      <ThemeProvider>
        <BrowserLanguageProvider>
          <RouterProvider router={router} />
        </BrowserLanguageProvider>
      </ThemeProvider>
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

it("changes theme and language on the landing page without account reads", async () => {
  const router = await page("/");
  const themeToggle = screen.getByRole("button", { name: "Appearance: Follow system" });
  expect(themeToggle).toHaveAccessibleDescription("Follow system → Light");
  fireEvent.click(themeToggle);
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
  expect(localStorage.getItem("theme")).toBe("light");
  expect(themeToggle).toHaveAccessibleName("Appearance: Light");
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(themeToggle);
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(themeToggle).toHaveAccessibleName("Appearance: Dark");
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Language" }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: "简体中文" }));
  await screen.findByRole("button", { name: "语言" });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(localStorage.getItem("raypx_locale")).toBe("zh");
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(document.documentElement.lang).toBe("zh");
  expect(themeToggle).toHaveAccessibleName("外观: 深色");
  expect(themeToggle).toHaveAccessibleDescription("深色 → 跟随系统");
  fireEvent.click(themeToggle);
  await waitFor(() => expect(localStorage.getItem("theme")).toBe("system"));
  expect(themeToggle).toHaveAccessibleName("外观: 跟随系统");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(localStorage.getItem("raypx_locale")).toBe("zh");
  expect(router.state.location.pathname).toBe("/");
  expect(mocks.loadAccount).not.toHaveBeenCalled();
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.tasks).not.toHaveBeenCalled();
  expect(mocks.devices).not.toHaveBeenCalled();
  expect(mocks.approvals).not.toHaveBeenCalled();
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

describe("public legal routes", () => {
  it("serves privacy outside the account shell when the API is unavailable", async () => {
    mocks.loadAccount.mockRejectedValue(new Error("API unavailable"));
    const router = await page("/privacy");
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeTruthy();
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      "__root__",
      "/(legal)",
      "/(legal)/privacy",
    ]);
    expect(screen.getByRole("link", { name: "Optional diagnostics" })).toHaveAttribute(
      "href",
      "/privacy#diagnostics",
    );
    expect(mocks.loadAccount).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.devices).not.toHaveBeenCalled();
    expect(mocks.tasks).not.toHaveBeenCalled();
    expect(mocks.configurationGet).not.toHaveBeenCalled();
  });

  it.each(["/", "/login", "/signup"])("links to privacy from %s", async (path) => {
    const router = await page(path);
    fireEvent.click(screen.getByRole("link", { name: "Privacy" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Privacy" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/privacy");
  });
});

describe("authentication routes", () => {
  it.each([
    { url: "/login", field: "Email address" },
    { url: "/signup", field: "Email address" },
    { url: "/forgot-password", field: "Email address" },
    { url: "/reset-password?token=test", field: "New password" },
  ])("changes theme in the shared authentication header at $url", async ({ url, field }) => {
    const router = await page(url);
    const input = screen.getByLabelText(field);
    fireEvent.change(input, { target: { value: "ada@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Appearance: Follow system" }));
    fireEvent.click(screen.getByRole("button", { name: "Appearance: Light" }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(input).toHaveValue("ada@example.test");
    expect(router.state.location.pathname).toBe(url.split("?")[0]);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("switches language without losing credentials or the return destination", async () => {
    mocks.signIn.mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    const router = await page("/login?returnTo=%2Fapprovals");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    const chinese = await screen.findByRole("menuitemradio", { name: "简体中文" });
    expect(screen.getByRole("menuitemradio", { name: "English" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(chinese);
    await screen.findByRole("heading", { level: 1, name: "欢迎回来" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "语言" }));
    const selected = await screen.findByRole("menuitemradio", { name: "简体中文" });
    expect(selected).toHaveAttribute("aria-checked", "true");
    fireEvent.click(selected);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.getByLabelText("邮箱地址")).toHaveValue("ada@example.test");
    expect(screen.getByLabelText("密码")).toHaveValue("password123");
    expect(localStorage.getItem("raypx_locale")).toBe("zh");
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toMatchObject({ returnTo: "/approvals" });
    expect(mocks.signIn).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole("button", { name: "登录" }).closest("form")!);
    await screen.findByRole("alert");
    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith({
      email: "ada@example.test",
      password: "password123",
      fetchOptions: { headers: { "Accept-Language": "zh" } },
    });
  });

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
      mocks.session = {
        user: { id: "user-1", name: "Ada", email: "ada@example.test" },
        session: { id: "session-1" },
      };
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

  it("retries a failed session refresh after login without submitting credentials again", async () => {
    mocks.signIn.mockImplementation(async () => {
      mocks.session = {
        user: { id: "user-1", name: "Ada", email: "ada@example.test" },
        session: { id: "session-1" },
      };
      mocks.sessionError = true;
      mocks.loadAccount.mockResolvedValue({ status: "signed-in", account: mocks.session.user });
      return { data: {}, error: null };
    });
    const router = await page("/login?returnTo=%2Fsettings");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await screen.findByText(/You’re signed in, but the page could not load/);
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.queryByLabelText("Password")).toBeNull();
    mocks.sessionError = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
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
          {
            provider: "codex",
            available: true,
            reason: "ready",
            version: "test",
            definition: {
              version: 1,
              runtime: "process",
              modes: ["run"],
              approvals: true,
              modelSelection: false,
            },
            inputModes: [],
          },
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
        fetchOptions: { headers: { "Accept-Language": "en" }, onError: expect.any(Function) },
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

it("preserves a validated return destination through Google OAuth", async () => {
  await page("/login?returnTo=%2Ftasks%3FtaskId%3Done");
  fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
  await waitFor(() =>
    expect(mocks.social).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        callbackURL: "https://raypx.example/login?oauth=success&returnTo=%2Ftasks%3FtaskId%3Done",
        errorCallbackURL: "https://raypx.example/login?returnTo=%2Ftasks%3FtaskId%3Done",
      }),
    ),
  );
});

it("refreshes the account and restores navigation on an OAuth callback", async () => {
  signIn();
  const router = await page("/login?oauth=success&returnTo=%2Faccount");
  await waitFor(() => expect(router.state.location.pathname).toBe("/account"));
});

it.each(["/login", "/signup"])(
  "redirects an existing account from %s to projects",
  async (path) => {
    signIn();
    const router = await page(path);
    expect(router.state.location.pathname).toBe("/projects");
    expect(screen.queryByLabelText("Password")).toBeNull();
  },
);
it("preserves password recovery for an existing account", async () => {
  signIn();
  const router = await page("/reset-password?token=valid");
  expect(router.state.location.pathname).toBe("/reset-password");
  expect(screen.getByLabelText("New password")).toBeTruthy();
});
it("uses the same account menu on the homepage and in the workspace", async () => {
  signIn("admin");
  const router = await page("/");
  fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
  expect(await screen.findByRole("menuitem", { name: "Users" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Site settings" })).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  expect(await screen.findByRole("menuitem", { name: "Users" })).toBeTruthy();
});
it("blocks a member's user-management navigation before the page mounts", async () => {
  signIn();
  await page("/admin/users");
  expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
  expect(screen.queryByRole("table", { name: "Users" })).toBeNull();
});
it("blocks remote project reads when the signed-in permission projection is invalid", async () => {
  signIn();
  mocks.access.mockResolvedValue(accessForRole("admin", "another-account"));
  await page("/projects");
  expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
  expect(mocks.devices).not.toHaveBeenCalled();
});

it("keeps homepage session errors retryable without mounting private features", async () => {
  mocks.sessionError = true;
  await page("/");
  expect(screen.getByRole("heading", { name: "Remote sessions and approvals" })).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Retry account" }));
  expect(mocks.refetch).toHaveBeenCalledTimes(1);
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.tasks).not.toHaveBeenCalled();
});
it("retains the account menu on failed logout and clears private caches on success", async () => {
  signIn();
  const router = await page("/projects");
  router.options.context.queryClient.setQueryData(["private-test"], "cached");
  mocks.signOut.mockResolvedValueOnce({
    error: { code: "OFFLINE", message: "private diagnostic" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  expect(screen.queryByRole("menuitem", { name: "Users" })).toBeNull();
  fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to connect");
  expect(screen.queryByText("private diagnostic")).toBeNull();
  expect(router.options.context.queryClient.getQueryData(["private-test"])).toBe("cached");
  mocks.signOut.mockImplementationOnce(async () => {
    mocks.session = null;
    mocks.loadAccount.mockResolvedValue({ status: "signed-out" });
    return { error: null };
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  expect(router.options.context.queryClient.getQueryData(["private-test"])).toBeUndefined();
});
