import type { Locale, LocaleCatalogLoader, MessageCatalog } from "@voidmix/i18n/types";

const webCatalogLoaders = {
  en: () => import("../messages/en.json").then(({ default: messages }) => messages),
  zh: () => import("../messages/zh.json").then(({ default: messages }) => messages),
} satisfies Record<Locale, () => Promise<MessageCatalog>>;

export const loadWebMessages: LocaleCatalogLoader = (locale) => webCatalogLoaders[locale]();
