/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { BrowserLanguageProvider } from "@raypx/i18n/browser";
import { AuthPage } from "./auth";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: ({ select }: { select: (location: { searchStr: string }) => string }) =>
    select({ searchStr: window.location.search }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("../account", () => ({
  webUrl: "https://raypx.example",
  authClient: {
    signIn: { email: mocks.signIn },
    signUp: { email: mocks.signUp },
    sendVerificationEmail: mocks.resend,
  },
  authErrorKey: (code?: string) =>
    code === "INVALID_EMAIL_OR_PASSWORD" ? "invalidCredentials" : "generic",
}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("raypx_locale", "en");
});
function page(mode: "login" | "signup") {
  return render(
    <BrowserLanguageProvider>
      <AuthPage mode={mode} />
    </BrowserLanguageProvider>,
  );
}
describe("account forms", () => {
  it("submits the canonical name and sends verification back to Web", async () => {
    mocks.signUp.mockResolvedValue({ data: {}, error: null });
    page("signup");
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
    page("login");
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
});
