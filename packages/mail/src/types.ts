import type { Locale } from "@voidmix/i18n/types";

export type MailAddress = {
  email: string;
  name?: string;
};

export type MailTemplateKind =
  | "email-verification"
  | "password-reset"
  | "welcome"
  | "task-notification";

export type MissingMailConfiguration = "RESEND_API_KEY" | "MAIL_FROM";

export interface ResolvedMailConfiguration {
  enabled: boolean;
  from: string | null;
  fromName: string;
  templatesBaseUrl: string | null;
  resendApiKey: string | null;
}

export type MailMessage = {
  template: MailTemplateKind;
  from: MailAddress;
  to: MailAddress | MailAddress[];
  subject: string;
  html: string;
  text: string;
  replyTo?: MailAddress;
  idempotencyKey?: string;
};

export type MailSendResult = { ok: true; id?: string } | { ok: false; error: string };

export interface MailTransport {
  send(message: MailMessage): Promise<MailSendResult>;
}

export type MailDeliveryEvent = {
  recipient: string | string[];
  template: MailTemplateKind;
  transport: "logger" | "resend";
  outcome: "failed" | "logged" | "sent";
  messageId?: string;
};

export type MailDeliveryRecorder = (event: MailDeliveryEvent) => void;

export type EmailTemplateResult = {
  subject: string;
  html: string;
  text: string;
};

export type SendWelcomeEmailInput = {
  email: string;
  name?: string | null;
  /** The recipient's language. Falls back to `MAIL_DEFAULT_LOCALE` when absent. */
  locale?: Locale;
};

export type SendLinkEmailInput = SendWelcomeEmailInput & {
  url: string;
  baseUrl?: string;
};

export type WelcomeTemplateInput = SendWelcomeEmailInput & {
  appUrl?: string;
};

export type TaskNotificationKind =
  | "review_ready"
  | "run_failed"
  | "waiting_input"
  | "task_completed";
export type SendTaskNotificationInput = SendWelcomeEmailInput & {
  kind: TaskNotificationKind;
  taskId: string;
  taskUrl: string;
  idempotencyKey?: string;
};

export interface Mailer {
  sendVerification(input: SendLinkEmailInput): Promise<void>;
  sendPasswordReset(input: SendLinkEmailInput): Promise<void>;
  sendWelcome(input: SendWelcomeEmailInput): Promise<void>;
  sendTaskNotification(input: SendTaskNotificationInput): Promise<void>;
}
