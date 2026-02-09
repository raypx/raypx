import { createRegistry } from "@raypx/shared/registry";
import type { ReactElement } from "react";
import z from "zod";
import type { EmailAdapter } from "./adapters";
import { ADAPTERS } from "./adapters";
import { getEmailContext } from "./context";
import type { EmailProvider, MailerSchema } from "./types";

// Extended provider list with new adapters
const MAILER_PROVIDERS = [
  "nodemailer",
  "resend",
  "sendgrid",
  "aws-ses",
  // add more providers here
] as const satisfies readonly EmailProvider[];

const MAILER_PROVIDER = z
  .enum(MAILER_PROVIDERS)
  .default("nodemailer")
  .parse(process.env.MAILER_PROVIDER);

// Mailer registry for lazy loading adapters
// Uses the new adapter system with dynamic dependency loading
const mailerRegistry = createRegistry<EmailAdapter, EmailProvider>();

// Register all available adapters
mailerRegistry.register("nodemailer", () => ADAPTERS.nodemailer());
mailerRegistry.register("resend", () => ADAPTERS.resend());
mailerRegistry.register("sendgrid", () => ADAPTERS.sendgrid());
mailerRegistry.register("aws-ses", () => ADAPTERS["aws-ses"]());

// Note: To add a new adapter, simply:
// 1. Create it in src/adapters/your-adapter.ts
// 2. Export it from src/adapters/index.ts
// 3. Add it to the MAILER_PROVIDERS array
// 4. Register it here: mailerRegistry.register("your-adapter", () => ADAPTERS["your-adapter"]());

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
 * Provider selection priority:
 * 1. Context provider (from AsyncContext)
 * 2. Call-time provider parameter
 * 3. Environment variable (MAILER_PROVIDER)
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, from, subject, template, provider } = options;

  try {
    // Get the current context (if any)
    const context = getEmailContext();

    // Determine provider with priority: context > parameter > env var
    const providerToUse = (context?.provider || provider || MAILER_PROVIDER) as EmailProvider;

    // Log context if available
    if (context?.requestId) {
      console.log(
        `[Email] Sending email with requestId: ${context.requestId}, provider: ${providerToUse}`,
      );
    }

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

/**
 * Current mailer provider (from MAILER_PROVIDER env var, defaults to "resend")
 * @internal - Exported for advanced use cases, most users should use sendEmail()
 */
export { MAILER_PROVIDER };

// Export adapter types for advanced usage
export type {
  EmailAdapter,
  EmailAdapterConfig,
  EmailAdapterResult,
} from "./adapters";
// Export adapter utilities
export { BaseEmailAdapter } from "./adapters/base";
// Export context utilities for async context management
export {
  type EmailContext,
  getEmailContext,
  mergeEmailContext,
  withEmailContext,
  withEmailProvider,
  withTenantContext,
} from "./context";
// Export all email types for consumers
export type {
  EmailEventType,
  EmailProvider,
  EmailStatus,
} from "./types";
