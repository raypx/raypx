import { createDefaultAuthSettings } from "@voidmix/core";
import type { Mailer } from "@voidmix/mail/types";
import { describe, expect, it, vi } from "vite-plus/test";

import { recipientLocale, sendWelcomeEmailIfEnabled } from "./config.js";

function mailer(sendWelcome: Mailer["sendWelcome"]): Mailer {
  return {
    sendVerification: async () => {},
    sendPasswordReset: async () => {},
    sendWelcome,
    sendTaskNotification: async () => {},
  };
}

describe("welcome email policy", () => {
  it.each([
    ["Accept-Language", { "accept-language": "zh-CN, en;q=0.8" }, { locale: "zh" }],
    ["cookie precedence", { cookie: "locale=en", "accept-language": "zh-CN" }, { locale: "en" }],
    ["no headers", {}, {}],
    ["no request", undefined, {}],
  ])("resolves recipient locale: %s", (_name, headers, expected) => {
    const request = headers ? new Request("https://voidmix.test/api/auth", { headers }) : undefined;
    expect(recipientLocale(request)).toEqual(expected);
  });

  it.each([
    ["disabled", false, {}],
    ["enabled without a locale", true, {}],
    ["enabled with Chinese locale", true, { locale: "zh" }],
  ] as const)("applies welcome policy: %s", async (_name, welcomeEmailEnabled, locale) => {
    const sendWelcome = vi.fn<Mailer["sendWelcome"]>(async () => {});
    const user = { email: "person@example.com", name: "Person" };
    await sendWelcomeEmailIfEnabled({
      user,
      mailer: mailer(sendWelcome),
      getAuthSettings: async () => ({ ...createDefaultAuthSettings(), welcomeEmailEnabled }),
      ...locale,
    });
    if (!welcomeEmailEnabled) expect(sendWelcome).not.toHaveBeenCalled();
    else {
      expect(sendWelcome).toHaveBeenCalledWith({ ...user, ...locale });
      expect(Object.keys(sendWelcome.mock.calls[0]![0])).toEqual([
        "email",
        "name",
        ...Object.keys(locale),
      ]);
    }
  });
});
