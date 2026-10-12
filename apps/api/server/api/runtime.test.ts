import { describe, expect, it, vi } from "vite-plus/test";
import { createDefaultAuthSettings, type AuthSettings } from "@voidmix/core";

import { createMailProtectedAuthHandler } from "./runtime.js";

function authHandler(
  getAuthSettings: () => Promise<AuthSettings> = async () => createDefaultAuthSettings(),
  configurationState: "ready" | "incomplete" = "ready",
) {
  const handler = vi.fn(async () => new Response("auth-ok"));
  const guarded = createMailProtectedAuthHandler({
    handler,
    getAuthSettings,
    getMailSettings: async () => ({ configurationState }),
  });
  return { handler, guarded };
}
function request(path: string, body?: object) {
  return new Request(`http://voidmix.test/api/auth/${path}`, {
    method: "POST",
    ...(body
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

describe("mail-protected Better Auth operations", () => {
  it.each([
    "/api/auth/sign-up/email",
    "/api/auth/request-password-reset",
    "/api/auth/send-verification-email",
  ])("returns a stable 503 for %s when mail is unavailable", async (path) => {
    const { handler, guarded } = authHandler(async () => createDefaultAuthSettings(), "incomplete");

    const response = await guarded(request(path.replace("/api/auth/", "")));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "MAIL_NOT_CONFIGURED",
      data: { error: { code: "MAIL_NOT_CONFIGURED" } },
      problem: { code: "MAIL_NOT_CONFIGURED", status: 503 },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not block verified-user login", async () => {
    const { guarded } = authHandler(async () => createDefaultAuthSettings(), "incomplete");

    const response = await guarded(request("sign-in/email"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("auth-ok");
  });

  it("applies registration changes without rebuilding the handler", async () => {
    let settings: AuthSettings = createDefaultAuthSettings();
    const { handler, guarded } = authHandler(async () => settings, "ready");
    const signup = () =>
      request("sign-up/email", { email: "person@example.com", password: "password123" });

    expect((await guarded(signup())).status).toBe(200);
    settings = { ...settings, registrationMode: "closed" };

    const response = await guarded(signup());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "REGISTRATION_DISABLED" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("enforces an exact, case-insensitive allowed email domain list", async () => {
    const { guarded } = authHandler(
      async () => ({
        ...createDefaultAuthSettings(),
        allowedEmailDomains: ["example.com"],
      }),
      "ready",
    );

    const rejected = await guarded(request("sign-up/email", { email: "person@other.example" }));
    const accepted = await guarded(request("sign-up/email", { email: "PERSON@EXAMPLE.COM" }));

    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ code: "EMAIL_DOMAIN_NOT_ALLOWED" });
    expect(accepted.status).toBe(200);
  });

  it.each([
    {
      path: "/api/auth/send-verification-email",
      setting: "verificationEmailEnabled" as const,
      code: "EMAIL_VERIFICATION_DISABLED",
    },
    {
      path: "/api/auth/request-password-reset",
      setting: "passwordResetEmailEnabled" as const,
      code: "PASSWORD_RESET_DISABLED",
    },
  ])("blocks $path when its delivery policy is disabled", async ({ path, setting, code }) => {
    const { handler, guarded } = authHandler(
      async () => ({ ...createDefaultAuthSettings(), [setting]: false }),
      "ready",
    );

    const response = await guarded(request(path.replace("/api/auth/", "")));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code });
    expect(handler).not.toHaveBeenCalled();
  });
});
