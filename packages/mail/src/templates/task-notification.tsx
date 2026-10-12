import { render, Text } from "react-email";
import type { Locale } from "@voidmix/i18n/types";
import type { SendTaskNotificationInput } from "../types.js";
import { createMailTranslator } from "../i18n.js";
import { MailLayout } from "./layout.js";

export async function taskNotificationEmail(
  input: SendTaskNotificationInput,
  locale: Locale = "en",
) {
  const url = new URL(input.taskUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw new TypeError("Task notification requires an HTTP task URL.");
  const t = createMailTranslator("taskNotification", locale);
  const common = createMailTranslator("common", locale);
  const body = t(input.kind);
  const hello = input.name?.trim()
    ? common("greetingNamed", { name: input.name.trim() })
    : common("greeting");
  const html = await render(
    <MailLayout
      locale={locale}
      preview={body}
      title={t("subject")}
      footer={common("footer")}
      action={{ label: t("button"), url: url.href }}
    >
      <Text>{hello}</Text>
      <Text>{body}</Text>
    </MailLayout>,
  );
  return {
    subject: t("subject"),
    html,
    text: [hello, "", body, "", t("button"), url.href].join("\n"),
  };
}
