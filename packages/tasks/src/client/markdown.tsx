import { ReplyMarkdown } from "@raypx/blocks/markdown";
import { useTranslations } from "./i18n.js";

export function TaskMarkdown({ children }: { children: string }) {
  const t = useTranslations("tasks");
  return (
    <ReplyMarkdown
      copyLabel={t("copyCode")}
      copiedLabel={t("codeCopied")}
      copyErrorLabel={t("copyCodeError")}
    >
      {children}
    </ReplyMarkdown>
  );
}
