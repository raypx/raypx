export type MailLocale = "en" | "zh";
export interface SendLinkEmailInput {
  email: string;
  name?: string | null;
  url: string;
  locale?: MailLocale;
  /** Defaults to Raypx. */
  siteName?: string;
}
export interface SendSignInCodeInput extends Omit<SendLinkEmailInput, "url"> {
  code: string;
}
export interface Mailer {
  sendTest?(input: { email: string; locale?: MailLocale }): Promise<void>;
  sendVerification(input: SendLinkEmailInput): Promise<void>;
  sendPasswordReset(input: SendLinkEmailInput): Promise<void>;
  sendSignInCode(input: SendSignInCodeInput): Promise<void>;
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
