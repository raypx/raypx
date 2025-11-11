import type { ReactElement } from "react";
import z from "zod";
import { mailerRegistry } from "./registry";
import type { EmailProvider, MailerSchema } from "./types";

const MAILER_PROVIDERS = [
  "nodemailer",
  "resend",
  // add more providers here
] as const satisfies readonly EmailProvider[];

const MAILER_PROVIDER = z
  .enum(MAILER_PROVIDERS)
  .default("resend")
  .parse(process.env.MAILER_PROVIDER);

/**
 * @name getMailer
 * @description Get the mailer based on the environment variable using the registry internally.
 */
export function getMailer() {
  return mailerRegistry.get(MAILER_PROVIDER);
}

/**
 * Options for sending an email
 */
export type SendEmailOptions = {
  to: string | string[];
  from: string;
  subject: string;
  template: ReactElement | string;
  provider?: EmailProvider;
};

/**
 * Result of sending an email
 */
export type SendEmailResult =
  | { success: true; emailId?: string; messageId?: string; provider: EmailProvider }
  | { success: false; error: string; provider: EmailProvider };

/**
 * Send an email using the configured provider
 *
 * @example
 * ```typescript
 * import { sendEmail } from "@raypx/email";
 * import { WelcomeEmail } from "@raypx/email/emails";
 *
 * const result = await sendEmail({
 *   to: "user@example.com",
 *   from: "noreply@raypx.com",
 *   subject: "Welcome to Raypx!",
 *   template: <WelcomeEmail username="John" />
 * });
 *
 * if (result.success) {
 *   console.log("Email sent!", result.emailId);
 * } else {
 *   console.error("Failed to send email:", result.error);
 * }
 * ```
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, from, subject, template, provider } = options;

  try {
    // Get the mailer instance (use specified provider or default)
    const providerToUse = provider || MAILER_PROVIDER;
    const mailer = await mailerRegistry.get(providerToUse);

    // Normalize 'to' field to single email (providers expect single email in MailerSchema)
    const toEmail = Array.isArray(to) ? to[0] : to;

    if (!toEmail) {
      return {
        success: false,
        error: "No recipient email provided",
        provider: providerToUse,
      };
    }

    // Prepare email data according to MailerSchema
    const emailData: z.infer<typeof MailerSchema> = {
      to: toEmail,
      from,
      subject,
      template,
    };

    // Send the email
    const result = await mailer.sendEmail(emailData);

    // Success response (different providers return different data)
    return {
      success: true,
      emailId:
        typeof result === "object" && result && "id" in result ? String(result.id) : undefined,
      messageId:
        typeof result === "object" && result && "messageId" in result
          ? String(result.messageId)
          : undefined,
      provider: providerToUse,
    };
  } catch (error) {
    // Error handling
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    return {
      success: false,
      error: errorMessage,
      provider: provider || MAILER_PROVIDER,
    };
  }
}

// Export provider constant
export { MAILER_PROVIDER };

// Export configuration
export { RESEND_FROM } from "./config";
// Export all email templates
export * from "./emails";
// Export all email types for consumers
export type {
  EmailEventType,
  EmailProvider,
  EmailStatus,
  EmailTemplateProps,
  SendEmailFailure,
  SendEmailResult as LegacySendEmailResult,
  SendEmailSuccess,
} from "./types";
