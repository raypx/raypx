import { useLocale } from "@raypx/ui/hooks/use-locale";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { TanstackProvider } from "fumadocs-core/framework/tanstack";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { docsI18nConfig } from "@/lib/docs/i18n";

const translations = {
  zh: {
    displayName: "简体中文",
    search: "搜索",
  },
  en: {
    displayName: "English",
    search: "Search",
  },
};

const { provider } = defineI18nUI(docsI18nConfig, { translations });

function DocsLayout() {
  const { locale, setLocale } = useLocale();

  return (
    <TanstackProvider>
      <RootProvider
        i18n={{
          ...provider(locale),
          onLocaleChange(v) {
            setLocale(v);
          },
        }}
      >
        <Outlet />
      </RootProvider>
    </TanstackProvider>
  );
}

export const Route = createFileRoute("/docs")({
  component: DocsLayout,
});
