import { describe, expect, it } from "vite-plus/test";
import {
  createDefaultAuthSettings,
  createPublicAuthCapabilities,
  type MailSettingsFallback,
} from "./index";

const fallback: MailSettingsFallback = {
  enabled: { value: true, source: "default" },
  from: { value: null, source: "missing" },
  fromName: { value: "Voidmix", source: "default" },
  templatesBaseUrl: { value: null, source: "missing" },
  resendApiKey: { value: null, source: "missing" },
};

describe("public auth capabilities", () => {
  it("exposes capabilities only when verification mail is configured", async () => {
    const service = createPublicAuthCapabilities({
      settings: {
        resolveAuthSettings: async () => createDefaultAuthSettings(),
        resolveMailConfiguration: async () => ({
          settings: {
            enabled: true,
            from: "mail@example.com",
            fromName: "Voidmix",
            templatesBaseUrl: null,
            configurationState: "incomplete",
            missing: ["RESEND_API_KEY", "MAIL_FROM"],
          },
          resendApiKey: null,
        }),
      },
      mailFallback: fallback,
    });
    await expect(service.get()).resolves.toEqual({
      registrationAvailable: false,
      verificationEmailRequestAvailable: false,
      passwordResetRequestAvailable: false,
    });
  });
});
