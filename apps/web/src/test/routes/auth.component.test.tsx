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
import { routeTree } from "../../routeTree.gen";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../../features/auth/account", () => ({
  webUrl: "https://raypx.example",
  loadAccount: async () => ({ status: "signed-out" }),
  authClient: {
    signIn: { email: mocks.signIn },
    signUp: { email: mocks.signUp },
    sendVerificationEmail: mocks.resend,
    requestPasswordReset: mocks.requestPasswordReset,
    resetPassword: mocks.resetPassword,
    signOut: mocks.signOut,
  },
}));
vi.mock("../../preferences", () => ({
  loadPreferences: () => ({ theme: "light", locale: "en", systemLocale: "en" }),
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
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
});

async function page(url: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(
    <BrowserLanguageProvider>
      <RouterProvider router={router} />
    </BrowserLanguageProvider>,
  );
  return router;
}

describe("authentication routes", () => {
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

  it("returns to the account route after successful sign-in", async () => {
    mocks.signIn.mockResolvedValue({ data: {}, error: null });
    const router = await page("/login");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await waitFor(() => expect(screen.queryByLabelText("Password")).toBeNull());
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
