/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { mocks, page, signIn } from "../tests/helpers/router-auth";

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
