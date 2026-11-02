import { useTranslations } from "@raypx/i18n/browser";
import type { AuthActionError } from "../hooks";

export function useAuthErrorMessage(
  error: AuthActionError | null,
  completionMessage: "signInCompletionFailed" | "passwordChangeRefresh",
) {
  const t = useTranslations();
  if (!error) return "";
  if (error.kind === "network") return t("common.networkError");
  if (error.kind === "completion") return t(`auth.${completionMessage}`);
  return error.key === "generic" ? t("common.error") : t(`auth.${error.key}`);
}
