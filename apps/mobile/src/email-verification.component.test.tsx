import { beforeEach, expect, it, vi } from "vitest";
import type { ApiClient } from "@raypx/client/api";
import { EmailVerificationReminder } from "./email-verification.js";
import { findByLabel, press, renderNative, textContent } from "../tests/native.js";

const state = vi.hoisted(() => ({ language: "en", send: vi.fn() }));
vi.mock("./auth.js", () => ({
  apiOrigin: "https://api.example.test",
  authClient: { sendVerificationEmail: state.send },
}));
vi.mock("expo-localization", () => ({ useLocales: () => [{ languageTag: state.language }] }));
beforeEach(() => {
  state.language = "en";
  state.send.mockReset().mockResolvedValue({ data: { status: true }, error: null });
});
function api(mailConfigured: boolean) {
  return {
    configuration: {
      public: vi.fn(async () => ({
        siteName: "Raypx",
        registrationEnabled: true,
        bootstrap: false,
        setupTokenRequired: false,
        mailConfigured,
      })),
    },
  } as unknown as ApiClient;
}
it.each(["en", "zh"])(
  "keeps verification optional for admitted accounts and dismisses without sending in %s",
  async (language) => {
    state.language = language;
    const port = api(true);
    const view = await renderNative(
      <EmailVerificationReminder api={port} email="member@example.test" verified={false} />,
    );
    expect(textContent(view.root)).toContain(
      language === "en" ? "You can keep using your account" : "你可以继续使用账号",
    );
    await press(findByLabel(view.root, language === "en" ? "Dismiss" : "暂时关闭"));
    expect(textContent(view.root)).toBe("");
    expect(state.send).not.toHaveBeenCalled();
    await view.unmount();
  },
);
it("sends to the current account once and leaves admission unchanged", async () => {
  const view = await renderNative(
    <EmailVerificationReminder api={api(true)} email="member@example.test" verified={false} />,
  );
  await press(findByLabel(view.root, "Send verification email"));
  expect(textContent(view.root)).toContain("Verification email sent.");
  await press(findByLabel(view.root, "Verification email sent. Check your inbox."));
  expect(state.send).toHaveBeenCalledTimes(1);
  expect(state.send.mock.calls[0]![0]).toMatchObject({ email: "member@example.test" });
  await view.unmount();
});
it.each([false, true])(
  "hides the reminder when delivery is unavailable or the email is already verified (%s)",
  async (verified) => {
    const view = await renderNative(
      <EmailVerificationReminder
        api={api(verified)}
        email="member@example.test"
        verified={verified}
      />,
    );
    expect(textContent(view.root)).toBe("");
    expect(state.send).not.toHaveBeenCalled();
    await view.unmount();
  },
);
it("shows a safe failure and lets the member retry sending", async () => {
  state.send.mockRejectedValueOnce(new Error("private delivery details"));
  const view = await renderNative(
    <EmailVerificationReminder api={api(true)} email="member@example.test" verified={false} />,
  );
  await press(findByLabel(view.root, "Send verification email"));
  expect(textContent(view.root)).not.toContain("private delivery details");
  expect(
    view.root.findAll((node) => node.props.accessibilityRole === "alert").length,
  ).toBeGreaterThan(0);
  await press(findByLabel(view.root, "Send verification email"));
  expect(state.send).toHaveBeenCalledTimes(2);
  expect(textContent(view.root)).toContain("Verification email sent.");
  await view.unmount();
});
