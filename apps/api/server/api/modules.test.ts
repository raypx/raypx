import { domainFixtures } from "./test-fixtures.js";
import { InMemorySystemSettingsRepository, InMemoryUserRepository } from "@voidmix/db";
import type { MailSettingsFallback, User } from "@voidmix/core";
import { describe, expect, it } from "vite-plus/test";

import { createApiModules } from "./modules.js";

const users: User[] = [
  {
    id: "owner-1",
    email: "owner@example.com",
    displayName: "Owner",
    role: "owner",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

const fallback: MailSettingsFallback = {
  enabled: { value: true, source: "default" },
  from: { value: null, source: "missing" },
  fromName: { value: "Voidmix", source: "default" },
  templatesBaseUrl: { value: null, source: "missing" },
  resendApiKey: { value: null, source: "missing" },
};

describe("createApiModules", () => {
  it("constructs the business module graph from explicit dependencies", async () => {
    const repository = new InMemoryUserRepository(users);
    const settings = new InMemorySystemSettingsRepository({ auditEvents: repository.auditEvents });
    const modules = createApiModules({
      ...domainFixtures(),
      users: repository,
      settings,
      mailFallback: fallback,
    });

    await expect(modules.users.get("owner-1")).resolves.toMatchObject({ id: "owner-1" });
    await expect(modules.publicAuthCapabilities.get()).resolves.toMatchObject({
      registrationAvailable: false,
    });
  });
});
