import { render, Text } from "react-email";
import type { Locale } from "@voidmix/i18n/types";
import type { SendLinkEmailInput } from "../types.js";
import { MailLayout } from "./layout.js";
import { linkFallback } from "./shared.js";
import { createMailTranslator } from "../i18n.js";

export const linkEmail = async (
  kind: "verification" | "passwordReset",
  input: SendLinkEmailInput,
  locale: Locale = "en",
) => {
  const t = createMailTranslator(kind, locale);
  const common = createMailTranslator("common", locale);
  const hello = input.name?.trim()
    ? common("greetingNamed", { name: input.name.trim() })
    : common("greeting");
  const html = await render(
    <MailLayout
      {...(input.baseUrl ? { baseUrl: input.baseUrl } : {})}
      footer={common("footer")}
      locale={locale}
      preview={t("preview")}
      title={t("title")}
      action={{ label: t("button"), url: input.url }}
    >
      <Text>{hello}</Text>
      <Text>{t("body")}</Text>
      <Text>{t("copyLink")}</Text>
      <Text>{input.url}</Text>
    </MailLayout>,
  );
  const text = [
    hello,
    "",
    t("body"),
    "",
    linkFallback(t("button"), input.url),
    "",
    t("fallback"),
  ].join("\n");
  return { subject: t("subject"), html, text };
};
