import { describe, expect, it, vi } from "vite-plus/test";

import type { MailMessage } from "../types.js";
import { createLoggerTransport } from "./logger.js";
import type { ResendClient } from "./resend.js";
import { createResendTransport } from "./resend.js";

const message: MailMessage = {
  template: "email-verification",
  from: { email: "mail@example.com", name: "Voidmix" },
  to: { email: "alex@example.com", name: "Alex" },
  replyTo: { email: "support@example.com" },
  subject: "Verify",
  html: "<p>secret content</p>",
  text: "secret content",
};

describe("mail transports", () => {
  it("forwards a stable notification delivery identity to the provider", async () => {
    const send = vi.fn(async () => ({ data: { id: "notification-mail" }, error: null }));
    await createResendTransport({
      apiKey: "test-key",
      client: { emails: { send } },
      record: vi.fn(),
    }).send({
      ...message,
      template: "task-notification",
      idempotencyKey: "notification:event:recipient",
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: "Verify" }), {
      idempotencyKey: "notification:event:recipient",
    });
  });
  it("uses the logger transport without exposing message contents", async () => {
    const record = vi.fn();
    const result = await createLoggerTransport({ record }).send(message);

    expect(result).toEqual({ ok: true, id: "logged" });
    expect(record).toHaveBeenCalledWith({
      recipient: "alex@example.com",
      template: "email-verification",
      transport: "logger",
      outcome: "logged",
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain("secret content");
  });

  it("maps a mail message to Resend", async () => {
    const send = vi.fn(async () => ({ data: { id: "mail_123" }, error: null }));
    const record = vi.fn();
    const client = { emails: { send } } satisfies ResendClient;
    const result = await createResendTransport({ apiKey: "test-key", client, record }).send(
      message,
    );

    expect(send).toHaveBeenCalledWith({
      from: "Voidmix <mail@example.com>",
      to: "Alex <alex@example.com>",
      replyTo: "support@example.com",
      subject: "Verify",
      html: "<p>secret content</p>",
      text: "secret content",
    });
    expect(result).toEqual({ ok: true, id: "mail_123" });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "sent", messageId: "mail_123" }),
    );
  });

  it("returns provider and thrown failures as results", async () => {
    const providerFailure = {
      emails: { send: vi.fn(async () => ({ data: null, error: { message: "rejected" } })) },
    } satisfies ResendClient;
    const thrownFailure = {
      emails: {
        send: vi.fn(async (): Promise<never> => {
          throw new Error("network unavailable");
        }),
      },
    } satisfies ResendClient;

    await expect(
      createResendTransport({ apiKey: "key", client: providerFailure, record: vi.fn() }).send(
        message,
      ),
    ).resolves.toEqual({ ok: false, error: "rejected" });
    await expect(
      createResendTransport({ apiKey: "key", client: thrownFailure, record: vi.fn() }).send(
        message,
      ),
    ).resolves.toEqual({ ok: false, error: "network unavailable" });
  });
});
