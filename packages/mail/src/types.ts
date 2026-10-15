export type MailLocale = "en" | "zh";
export interface SendLinkEmailInput {
  email: string;
  name?: string | null;
  url: string;
  locale?: MailLocale;
}
export interface Mailer {
  sendVerification(input: SendLinkEmailInput): Promise<void>;
  sendPasswordReset(input: SendLinkEmailInput): Promise<void>;
}
export interface MailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}
export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}
