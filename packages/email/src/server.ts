import { Resend } from "resend";
import { renderLinkEmail } from "./templates.js";
import type {
  Mailer,
  MailLocale,
  MailMessage,
  MailTransport,
  SendLinkEmailInput,
} from "./types.js";

export type {
  Mailer,
  MailLocale,
  MailMessage,
  MailTransport,
  SendLinkEmailInput,
} from "./types.js";
export interface CreateMailerOptions {
  apiKey?: string;
  from?: string;
  defaultLocale?: MailLocale;
  transport?: MailTransport;
}
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
  async function send(kind: "verification" | "reset", input: SendLinkEmailInput) {
    if (!available) throw new MailUnavailableError();
    const message: MailMessage = {
      to: input.email,
      from: options.from ?? "Raypx <noreply@raypx.local>",
      ...(await renderLinkEmail(kind, input, options.defaultLocale)),
    };
    if (options.transport) {
      await options.transport.send(message);
      return;
    }
    if (!resend || !options.from?.trim()) throw new MailUnavailableError();
    const { error } = await resend.emails.send(message);
    if (error) throw new Error("Authentication email delivery failed");
  }
  return {
    available,
    sendVerification: (input) => send("verification", input),
    sendPasswordReset: (input) => send("reset", input),
  };
}
