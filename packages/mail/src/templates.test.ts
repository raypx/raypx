import { expect, it, vi } from "vite-plus/test";
import { renderLinkEmail } from "./templates.js";
import { createMailer, MailUnavailableError } from "./server.js";

it("renders one locale, safe HTML and a plain-text link", () => {
  const result = renderLinkEmail("verification", {
    email: "u@example.com",
    name: "<script>",
    url: "https://example.com/verify?token=x&next=y",
    locale: "zh",
  });
  expect(result.subject).toBe("验证你的邮箱");
  expect(result.html).toContain('lang="zh"');
  expect(result.html).toContain("&lt;script&gt;");
  expect(result.text).toContain("token=x&next=y");
});

it("injects an in-memory transport", async () => {
  const seen: unknown[] = [];
  const mailer = createMailer({
    transport: {
      async send(message) {
        seen.push(message);
      },
    },
  });
  await mailer.sendPasswordReset({ email: "u@example.com", url: "https://example.com/reset" });
  expect(seen).toHaveLength(1);
});

it("rejects unconfigured verification and reset delivery without logging private input", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const mailer = createMailer({});
    expect(mailer.available).toBe(false);
    const input = {
      email: "private-recipient@example.com",
      name: "Private Name",
      url: "https://example.com/verify?token=private-token",
    };
    await expect(mailer.sendVerification(input)).rejects.toMatchObject({
      code: "MAIL_NOT_CONFIGURED",
    });
    await expect(mailer.sendPasswordReset(input)).rejects.toBeInstanceOf(MailUnavailableError);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  }
});
