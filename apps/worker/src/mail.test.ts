import { expect, it, vi } from "vite-plus/test";
import { createWorkerMailer } from "./mail.js";

it("consults current database mail settings and respects disabling on every delivery", async () => {
  const resolveMailConfiguration = vi.fn(async () => ({
    settings: {
      enabled: false,
      from: "sender@example.com",
      fromName: "Voidmix",
      templatesBaseUrl: null,
      configurationState: "disabled" as const,
      missing: [],
    },
    resendApiKey: null,
  }));
  const mailer = createWorkerMailer({
    settings: { resolveMailConfiguration },
    values: { NODE_ENV: "test", MAIL_FROM: "fallback@example.com" },
  });
  const input = {
    email: "owner@example.com",
    kind: "waiting_input" as const,
    taskId: "task",
    taskUrl: "https://example.com/tasks/task",
    idempotencyKey: "stable",
  };
  await expect(mailer.sendTaskNotification(input)).rejects.toMatchObject({
    code: "MAIL_NOT_CONFIGURED",
  });
  await expect(mailer.sendTaskNotification(input)).rejects.toMatchObject({
    code: "MAIL_NOT_CONFIGURED",
  });
  expect(resolveMailConfiguration).toHaveBeenCalledTimes(2);
  expect(resolveMailConfiguration).toHaveBeenCalledWith(
    expect.objectContaining({ from: { value: "fallback@example.com", source: "environment" } }),
  );
});
