import { Resend } from "resend";
import { renderLinkEmail } from "./templates.js";
import type {
  Mailer,
  MailLocale,
  MailMessage,
  MailTransport,
  SendLinkEmailInput,
  SendSignInCodeInput,
} from "./types.js";

export type {
  Mailer,
  MailLocale,
  MailMessage,
  MailTransport,
  SendLinkEmailInput,
  SendSignInCodeInput,
} from "./types.js";
export interface CreateMailerOptions {
  apiKey?: string;
  from?: string;
  defaultLocale?: MailLocale;
  transport?: MailTransport;
}
const deliveryTimeoutMs = 8_000;

export class MailUnavailableError extends Error {
  readonly code = "MAIL_NOT_CONFIGURED";
  constructor() {
    super("Authentication mail is not configured");
  }
}
export function createMailer(
  options: CreateMailerOptions,
): Mailer & { readonly available: boolean } {
  const resend = options.apiKey?.trim() ? new Resend(options.apiKey) : undefined;
  const available = Boolean(options.transport || (resend && options.from?.trim()));
  async function deliver(email: string, content: Pick<MailMessage, "subject" | "html" | "text">) {
    if (!available) throw new MailUnavailableError();
    const message: MailMessage = {
      to: email,
      from: options.from ?? "Raypx <noreply@raypx.local>",
      ...content,
    };
    if (options.transport) {
      await options.transport.send(message);
      return;
    }
    if (!resend || !options.from?.trim()) throw new MailUnavailableError();
    const delivered = await resend.emails
      .send(message, { signal: AbortSignal.timeout(deliveryTimeoutMs) })
      .then(
        ({ error }) => !error,
        () => false,
      );
    if (!delivered) throw new Error("Authentication email delivery failed");
  }
  async function send(kind: "verification" | "reset", input: SendLinkEmailInput) {
    await deliver(input.email, await renderLinkEmail(kind, input, options.defaultLocale));
  }
  async function sendSignInCode(input: SendSignInCodeInput) {
    if (!/^\d{6}$/.test(input.code)) throw new Error("Invalid sign-in code");
    const zh = (input.locale ?? options.defaultLocale) === "zh";
    const subject = zh ? "Raypx 登录验证码" : "Your Raypx sign-in code";
    const intro = zh ? "此验证码将在 5 分钟后过期。" : "This code expires in five minutes.";
    await deliver(input.email, {
      subject,
      text: `${input.code}\n\n${intro}`,
      html: `<p><strong>${input.code}</strong></p><p>${intro}</p>`,
    });
  }
  return {
    available,
    async sendTest(input) {
      const zh = (input.locale ?? options.defaultLocale) === "zh";
      const subject = zh ? "Raypx 邮件配置测试" : "Raypx email configuration test";
      const text = zh
        ? "测试邮件已送达。此邮件没有登录或验证功能。"
        : "Your test email was delivered. This message does not sign you in or verify an address.";
      await deliver(input.email, { subject, text, html: `<p>${text}</p>` });
    },
    sendSignInCode,
    sendVerification: (input) => send("verification", input),
    sendPasswordReset: (input) => send("reset", input),
  };
}
