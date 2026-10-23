import { createElement } from "react";
import { render } from "@react-email/render";
import { type LinkEmailKind, linkEmailContent } from "./copy.js";
import PasswordResetEmail from "./emails/password-reset.js";
import VerificationEmail from "./emails/verification.js";
import type { MailLocale, SendLinkEmailInput } from "./types.js";

const templates = { verification: VerificationEmail, reset: PasswordResetEmail };

export async function renderLinkEmail(
  kind: LinkEmailKind,
  input: SendLinkEmailInput,
  defaultLocale: MailLocale = "en",
) {
  // Validates the link before rendering and supplies the subject and text body.
  const content = linkEmailContent(kind, input, defaultLocale);
  return {
    subject: content.subject,
    html: await render(createElement(templates[kind], { ...input, defaultLocale })),
    text: `${content.greeting}\n\n${content.body}\n\n${content.action}: ${content.url}\n\n${content.ignore}`,
  };
}
