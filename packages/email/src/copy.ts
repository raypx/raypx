import type { MailLocale, SendLinkEmailInput } from "./types.js";

export type LinkEmailKind = "verification" | "reset";

const copy = {
  en: {
    verification: [
      "Verify your email",
      "Verify email",
      "Confirm your email address to finish creating your {site} account.",
    ],
    reset: [
      "Reset your password",
      "Reset password",
      "Use this link to choose a new {site} password.",
    ],
    ignore: "If you did not request this email, you can ignore it.",
    hello: "Hello",
  },
  zh: {
    verification: ["验证你的邮箱", "验证邮箱", "请确认邮箱地址，完成 {site} 账号注册。"],
    reset: ["重置你的密码", "重置密码", "请通过此链接设置新的 {site} 密码。"],
    ignore: "如果你没有发起此请求，请忽略这封邮件。",
    hello: "你好",
  },
} as const;

export interface LinkEmailContent {
  locale: MailLocale;
  site: string;
  subject: string;
  greeting: string;
  body: string;
  action: string;
  url: string;
  ignore: string;
}

/** Resolves localized copy once so the HTML, text and subject always agree. */
export function linkEmailContent(
  kind: LinkEmailKind,
  input: SendLinkEmailInput,
  defaultLocale: MailLocale = "en",
): LinkEmailContent {
  const locale = input.locale ?? defaultLocale;
  const t = copy[locale];
  const [subject, action, body] = t[kind];
  const site = input.siteName?.trim() || "Raypx";
  const url = new URL(input.url);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Mail links must use HTTP(S)");
  return {
    locale,
    site,
    subject,
    greeting: `${t.hello}${input.name?.trim() ? ` ${input.name.trim()}` : ""}`,
    body: body.replace("{site}", site),
    action,
    url: url.href,
    ignore: t.ignore,
  };
}
