import { createLogger } from "@raypx/logger";
import { Resend } from "resend";

import { env } from "./env";

const logger = createLogger({ name: "email" });
const resend = new Resend(env.AUTH_RESEND_KEY);

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  try {
    const result = await resend.emails.send({
      from: env.RESEND_FROM,
      to,
      subject,
      html,
    });
    logger.info(`Email sent successfully to ${to}`, { id: result.data?.id });
    return result;
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error);
    throw error;
  }
}

export async function sendPasswordResetEmail({ to, url }: { to: string; url: string }) {
  const { subject, html } = await import("./templates").then((m) =>
    m.createPasswordResetTemplate(url),
  );

  return sendEmail({
    to,
    subject,
    html,
  });
}

export async function sendEmailVerificationEmail({ to, url }: { to: string; url: string }) {
  const { subject, html } = await import("./templates").then((m) =>
    m.createEmailVerificationTemplate(url),
  );

  return sendEmail({
    to,
    subject,
    html,
  });
}

export async function sendWelcomeEmail({ to }: { to: string }) {
  const { subject, html } = await import("./templates").then((m) =>
    m.createWelcomeEmailTemplate(to, { appName: "Raypx" }),
  );

  return sendEmail({
    to,
    subject,
    html,
  });
}
