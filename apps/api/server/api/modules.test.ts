import { domainFixtures } from "./test-fixtures.js";
import { InMemorySystemSettingsRepository } from "@raypx/db";
import type { MailSettingsFallback } from "@raypx/core";
import { describe, expect, it } from "vite-plus/test";

import { createApiModules } from "./modules.js";

const fallback: MailSettingsFallback = {
  enabled: { value: true, source: "default" },
  from: { value: null, source: "missing" },
  fromName: { value: "Raypx", source: "default" },
  templatesBaseUrl: { value: null, source: "missing" },
  resendApiKey: { value: null, source: "missing" },
};

describe("createApiModules", () => {
  it("constructs the business module graph from explicit dependencies", async () => {
    const settings = new InMemorySystemSettingsRepository();
    const modules = createApiModules({
      ...domainFixtures(),
      settings,
      mailFallback: fallback,
    });

    await expect(modules.publicAuthCapabilities.get()).resolves.toMatchObject({
      registrationAvailable: false,
    });
  });
});
