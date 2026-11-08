import { createElement } from "react";
import { render } from "@react-email/render";
import { type LinkEmailKind, linkEmailContent } from "./copy.ts";
import PasswordResetEmail from "./emails/password-reset.tsx";
import VerificationEmail from "./emails/verification.tsx";
import type { MailLocale, SendLinkEmailInput } from "./types.ts";

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
