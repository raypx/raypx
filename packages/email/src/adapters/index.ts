/**
 * Email adapters module
 * Provides adapter-based email sending with dynamic dependency loading and caching
 */

export { createSESAdapter, SESAdapter } from "./aws-ses";
export { BaseEmailAdapter } from "./base";
export { createNodemailerAdapter, NodemailerAdapter } from "./nodemailer";
// Export individual adapters
export { createResendAdapter, ResendAdapter } from "./resend";
export { createSendGridAdapter, SendGridAdapter } from "./sendgrid";
// Export adapter types
export type { EmailAdapter, EmailAdapterConfig, EmailAdapterResult } from "./types";

/**
 * Adapter registry for dynamic loading
 * Maps adapter names to their factory functions
 *
 * @example
 * ```ts
 * const adapter = await ADAPTERS.resend();
 * await adapter.sendEmail({ to: 'user@example.com', from: 'noreply@example.com', subject: 'Hello', template: '<div>Email content</div>' });
 * ```
 */
export const ADAPTERS = {
  resend: async () => {
    const { createResendAdapter } = await import("./resend");
    return createResendAdapter();
  },
  nodemailer: async () => {
    const { createNodemailerAdapter } = await import("./nodemailer");
    return createNodemailerAdapter();
  },
  sendgrid: async () => {
    const { createSendGridAdapter } = await import("./sendgrid");
    return createSendGridAdapter();
  },
  "aws-ses": async () => {
    const { createSESAdapter } = await import("./aws-ses");
    return createSESAdapter();
  },
} as const;

/**
 * Available adapter names
 */
export type AdapterName = keyof typeof ADAPTERS;
