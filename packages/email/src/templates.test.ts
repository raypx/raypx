import { expect, it, vi } from "vitest";
import { renderLinkEmail } from "./templates.js";
import { createMailer, MailUnavailableError } from "./server.js";

it("renders one locale, safe HTML and a plain-text link", async () => {
  const result = await renderLinkEmail("verification", {
    email: "u@example.com",
    name: "<script>",
    url: "https://example.com/verify?token=x&next=y",
    locale: "zh",
  });
  expect(result.subject).toBe("验证你的邮箱");
  expect(result.html).toContain('lang="zh"');
  expect(result.html).toContain("&lt;script&gt;");
  expect(result.html).not.toContain("<script>");
  expect(result.html).toContain('href="https://example.com/verify?token=x&amp;next=y"');
  expect(result.text).toContain("token=x&next=y");
});

it("names the configured site and escapes it in HTML", async () => {
  const result = await renderLinkEmail("reset", {
    email: "u@example.com",
    url: "https://example.com/reset",
    siteName: "Team <b>",
  });
  expect(result.html).toMatch(/<h1[^>]*>Team &lt;b&gt;<\/h1>/);
  expect(result.html).toContain("new Team &lt;b&gt; password");
  expect(result.text).toContain("new Team <b> password");
  expect(
    (await renderLinkEmail("reset", { email: "u@example.com", url: "https://x.test" })).text,
  ).toContain("new Raypx password");
});

it("rejects links that are not HTTP(S)", async () => {
  await expect(
    renderLinkEmail("verification", { email: "u@example.com", url: "javascript:alert(1)" }),
  ).rejects.toThrow("Mail links must use HTTP(S)");
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

it("passes a deadline to Resend and reports a failed send without provider details", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ message: "private provider details" }, { status: 500 }));
  try {
    const mailer = createMailer({ apiKey: "re_test", from: "notify@example.com" });
    await expect(
      mailer.sendVerification({ email: "u@example.com", url: "https://example.com/verify" }),
    ).rejects.toThrow(/^Authentication email delivery failed$/);
    expect(timeout).toHaveBeenCalledWith(8_000);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[1]?.signal).toBe(timeout.mock.results.at(-1)?.value);
  } finally {
    request.mockRestore();
    timeout.mockRestore();
  }
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
