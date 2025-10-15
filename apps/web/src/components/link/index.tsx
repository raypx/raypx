import { createNavigation } from "@raypx/i18n/navigation";
import i18n from "@/lib/i18n";
import { DEFAULT_LANGUAGE_KEY } from "@/lib/i18n/constants";
import { useAppLanguage } from "@/state/app-store";

const navigation = createNavigation({
  getLocale: () => i18n.language ?? DEFAULT_LANGUAGE_KEY,
  getDefaultLocale: () => DEFAULT_LANGUAGE_KEY,
  localePrefix: "as-needed",
  localeParamKey: "lang",
  useLocale: () => useAppLanguage().language,
});

export const { Link, useRouter, usePathname, useSearchParams, getPathname, redirect } = navigation;

export default Link;
