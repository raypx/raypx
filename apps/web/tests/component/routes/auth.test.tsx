/** @vitest-environment jsdom */
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
import { routeTree } from "../../../src/routeTree.gen";

const mocks = vi.hoisted(() => ({
  registrationEnabled: true,
  sessionError: false,
  sessionPending: false,
  refetch: vi.fn(),
  session: null as null | {
    user: { id: string; name: string; email: string };
    session: { id: string };
  },
  tasks: vi.fn(async () => []),
  devices: vi.fn(async () => []),
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
vi.mock("../../../src/features/auth/client", () => ({
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
vi.mock("../../../src/features/configuration/client", () => ({
  publicConfigurationQuery: () => ({
    queryKey: ["configuration", "public"],
    queryFn: async () => ({ siteName: "Raypx", registrationEnabled: mocks.registrationEnabled }),
    initialData: { siteName: "Raypx", registrationEnabled: mocks.registrationEnabled },
    staleTime: Infinity,
  }),
  configurationAccessQuery: () => ({
    queryKey: ["configuration", "access"],
    queryFn: async () => ({ allowed: false }),
    enabled: false,
  }),
}));
vi.mock("../../../src/features/tasks/client", () => ({
  taskClient: {
    tasks: { list: mocks.tasks, create: mocks.create },
    devices: { list: mocks.devices },
    approvals: { list: mocks.approvals },
    subscribe: () => () => {},
  },
}));
vi.mock("../../../src/features/auth/account", () => ({
  loadAccount: mocks.loadAccount,
}));
vi.mock("../../../src/preferences", () => ({
  loadPreferences: () => ({ theme: "light", locale: "en", systemLocales: ["en"] }),
}));

const rootOptions = routeTree.options as typeof routeTree.options &
  Pick<RootRouteOptions, "shellComponent">;
const documentShell = rootOptions.shellComponent;
beforeAll(() => {
  // Component tests mount into jsdom's existing document; keep the real route tree.
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
    const router = await page("/");
    expect(router.state.location.pathname).toBe("/");
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

  it("returns to the account route after successful sign-in", async () => {
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
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(screen.queryByLabelText("Password")).toBeNull());
  });

  it("restores a guest draft after failed then successful sign-in without sending", async () => {
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
    await waitFor(() =>
      expect(screen.getByLabelText("What should the agent do?")).toHaveValue(prompt),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(router.state.location.search).toMatchObject({ from: "guest" });
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
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/signup"));
    expect(await screen.findByLabelText("Your name")).toBeTruthy();
    expect(screen.getByLabelText("Email address")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
