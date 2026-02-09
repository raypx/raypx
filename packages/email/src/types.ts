import { isValidElement, type ReactElement } from "react";
import { z } from "zod";

/**
 * Schema for email data validation
 */
export const MailerSchema = z.object({
  to: z.email(),
  from: z.string().min(1),
  subject: z.string(),
  template: z.union([z.string(), z.custom<ReactElement>((val) => isValidElement(val))]),
});

/**
 * Email delivery status
 */
export type EmailStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | "failed"
  | "delivery_delayed";

/**
 * Email provider type
 * Includes all available email adapters
 */
export type EmailProvider = "resend" | "nodemailer" | "sendgrid" | "aws-ses";

/**
 * Email event type (excludes queued and failed)
 */
export type EmailEventType = Exclude<EmailStatus, "queued" | "failed">;

/**
 * Resend webhook event type
 */
export type ResendWebhookEventType = `email.${Exclude<EmailEventType, "unsubscribed">}`;

/**
 * Email status constants
 */
export const EmailStatus = {
  QUEUED: "queued",
  SENT: "sent",
  DELIVERED: "delivered",
  OPENED: "opened",
  CLICKED: "clicked",
  BOUNCED: "bounced",
  COMPLAINED: "complained",
  UNSUBSCRIBED: "unsubscribed",
  FAILED: "failed",
  DELIVERY_DELAYED: "delivery_delayed",
} as const;

/**
 * Email provider constants
 */
export const EmailProvider = {
  RESEND: "resend",
  NODEMAILER: "nodemailer",
  SENDGRID: "sendgrid",
  AWS_SES: "aws-ses",
} as const;

/**
 * Email event type constants
 */
export const EmailEventType = {
  SENT: "sent",
  DELIVERED: "delivered",
  OPENED: "opened",
  CLICKED: "clicked",
  BOUNCED: "bounced",
  COMPLAINED: "complained",
  UNSUBSCRIBED: "unsubscribed",
  DELIVERY_DELAYED: "delivery_delayed",
} as const;

/**
 * Resend webhook event type constants
 */
export const ResendWebhookEventType = {
  EMAIL_SENT: "email.sent",
  EMAIL_DELIVERED: "email.delivered",
  EMAIL_DELIVERY_DELAYED: "email.delivery_delayed",
  EMAIL_COMPLAINED: "email.complained",
  EMAIL_BOUNCED: "email.bounced",
  EMAIL_OPENED: "email.opened",
  EMAIL_CLICKED: "email.clicked",
} as const;

/**
 * Type-safe arrays for validation
 */
export const EMAIL_STATUSES = Object.values(EmailStatus);
export const EMAIL_PROVIDERS = Object.values(EmailProvider);
export const EMAIL_EVENT_TYPES = Object.values(EmailEventType);
export const RESEND_WEBHOOK_EVENT_TYPES = Object.values(ResendWebhookEventType);
