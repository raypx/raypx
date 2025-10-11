import { useTranslation } from "react-i18next";

export type AuthTranslations = {
  t: (key: string, options?: any) => string;
};

/**
 * Returns the translations for the auth namespace
 * @returns The translations for the auth namespace
 */
export function useAuthTranslations(): AuthTranslations {
  const { t } = useTranslation("auth");

  return {
    t,
  };
}
