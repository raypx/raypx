import type { MailLocale, SendLinkEmailInput } from "./types.js";

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
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function renderLinkEmail(
  kind: "verification" | "reset",
  input: SendLinkEmailInput,
  defaultLocale: MailLocale = "en",
) {
  const locale = input.locale ?? defaultLocale;
  const t = copy[locale];
  const [subject, action, copyBody] = t[kind];
  const site = input.siteName?.trim() || "Raypx";
  const body = copyBody.replace("{site}", site);
  const url = new URL(input.url);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Mail links must use HTTP(S)");
  const greeting = `${t.hello}${input.name?.trim() ? ` ${input.name.trim()}` : ""}`;
  return {
    subject,
    html: `<!doctype html><html lang="${locale}"><body><h1>${escape(site)}</h1><p>${escape(greeting)}</p><p>${escape(body)}</p><p><a href="${escape(url.href)}">${action}</a></p><p>${escape(url.href)}</p><p>${t.ignore}</p></body></html>`,
    text: `${greeting}\n\n${body}\n\n${action}: ${url.href}\n\n${t.ignore}`,
  };
}
