import { render, Text } from "react-email";
import type { Locale } from "@voidmix/i18n/types";
import type { WelcomeTemplateInput } from "../types.js";
import { MailLayout } from "./layout.js";
import { createMailTranslator } from "../i18n.js";

export const welcomeEmail = async (input: WelcomeTemplateInput, locale: Locale = "en") => {
  const t = createMailTranslator("welcome", locale);
  const common = createMailTranslator("common", locale);
  const hello = input.name?.trim()
    ? common("greetingNamed", { name: input.name.trim() })
    : common("greeting");
  const html = await render(
    <MailLayout
      footer={common("footer")}
      locale={locale}
      preview={t("preview")}
      title={t("title")}
      {...(input.appUrl ? { action: { label: t("button"), url: input.appUrl } } : {})}
    >
      <Text>{hello}</Text>
      <Text>{t("body")}</Text>
    </MailLayout>,
  );
  const text = [hello, "", t("textIntro"), input.appUrl ? `\n${t("button")}:\n${input.appUrl}` : ""]
    .filter(Boolean)
    .join("\n");
  return { subject: t("subject"), html, text };
};
