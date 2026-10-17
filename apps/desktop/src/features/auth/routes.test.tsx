/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import {
  createHashHistory,
  createMemoryHistory,
  createRouter,
  Outlet,
  RouterProvider,
  type RootRouteOptions,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import type {} from "@testing-library/jest-dom/vitest";
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

expect.extend(matchers);

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  signOut: vi.fn(),
  account: vi.fn(),
  session: vi.fn(),
}));
vi.mock("./client", () => ({
  webUrl: "https://raypx.example",
  apiClient: { account: { get: mocks.account } },
  authClient: {
    signIn: { email: mocks.signIn },
    signUp: { email: mocks.signUp },
    sendVerificationEmail: mocks.resend,
    requestPasswordReset: mocks.requestPasswordReset,
    resetPassword: mocks.resetPassword,
    signOut: mocks.signOut,
    useSession: mocks.session,
  },
}));
// The complete route tree imports the terminal; auth tests do not mount xterm.
vi.mock("@xterm/xterm", () => ({ Terminal: vi.fn() }));

const rootOptions = routeTree.options as typeof routeTree.options &
  Pick<RootRouteOptions, "shellComponent">;
const documentShell = rootOptions.shellComponent;
const rootComponent = rootOptions.component;
const histories: ReturnType<typeof createMemoryHistory>[] = [];
beforeAll(() => {
  // Exercise the real leaf routes inside jsdom without mounting the native shell.
  rootOptions.shellComponent = ({ children }: { children: ReactNode }) => <>{children}</>;
  rootOptions.component = Outlet;
});
afterAll(() => {
  if (documentShell) rootOptions.shellComponent = documentShell;
  else delete rootOptions.shellComponent;
  if (rootComponent) rootOptions.component = rootComponent;
  else delete rootOptions.component;
});
afterEach(() => {
  cleanup();
  for (const history of histories.splice(0)) history.destroy();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockRejectedValue({ code: "UNAUTHORIZED" });
  mocks.session.mockReturnValue({ data: null, error: null, isPending: false });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear();
  localStorage.setItem("raypx_locale", "en");
  window.history.replaceState({}, "", "/");
});

async function page(url: string, hash = false) {
  if (hash) window.history.replaceState({}, "", `/#${url}`);
  const history = hash ? createHashHistory() : createMemoryHistory({ initialEntries: [url] });
  histories.push(history);
  const router = createRouter({ routeTree, history, defaultPendingMinMs: 0 });
  await router.load();
  render(
    <BrowserLanguageProvider>
      <RouterProvider router={router} />
    </BrowserLanguageProvider>,
  );
  return router;
}

describe("Desktop authentication routes", () => {
  it("sends signup verification links back to Web", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });
    await page("/signup");
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.signUp).toHaveBeenCalledWith({
        name: "Ada",
        email: "ada@example.test",
        password: "password123",
        callbackURL: "https://raypx.example/verify-email?verified=1",
        fetchOptions: { headers: { "Accept-Language": "en" } },
      }),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("navigates to the Desktop account route after sign-in", async () => {
    mocks.signIn.mockResolvedValue({ data: {}, error: null });
    mocks.account.mockResolvedValue({ id: "u1", name: "Ada", email: "ada@example.test" });
    mocks.session.mockReturnValue({
      data: { user: { id: "u1", name: "Ada", email: "ada@example.test" } },
      error: null,
      isPending: false,
    });
    const router = await page("/login");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/account"));
    await waitFor(() => expect(screen.queryByLabelText("Password")).toBeNull());
  });

  it("submits a reset-link token without requiring an email", async () => {
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

  it("prefills the recovery email and sends reset links back to Web", async () => {
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

  it("shows verification success with Desktop account and sign-in links", async () => {
    await page("/verify-email?verified=1");
    expect(screen.getByText("Your email is verified. You can sign in now.")).toBeTruthy();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("shows invalid-link feedback when the error query has no value", async () => {
    await page("/verify-email?error");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This link is invalid or has expired. Request a new email.",
    );
    expect(screen.getByLabelText("Email address")).toBeTruthy();
  });

  it("clears errors and fields when switching authentication routes", async () => {
    mocks.signIn.mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    const router = await page("/login");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "incorrect" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The email or password is incorrect.",
    );
    fireEvent.click(screen.getByRole("link", { name: "Create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/signup"));
    expect(await screen.findByLabelText("Your name")).toBeTruthy();
    expect(screen.getByLabelText("Email address")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reads reset tokens from hash history when the outer URL query is empty", async () => {
    mocks.resetPassword.mockResolvedValue({ data: {}, error: null });
    const router = await page("/reset-password?token=hash-token", true);
    expect(window.location.search).toBe("");
    expect(router.state.location.pathname).toBe("/reset-password");
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "replacement-password" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Reset password" }).closest("form")!);
    await waitFor(() =>
      expect(mocks.resetPassword).toHaveBeenCalledWith({
        token: "hash-token",
        newPassword: "replacement-password",
        fetchOptions: { headers: { "Accept-Language": "en" } },
      }),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
  });
});
