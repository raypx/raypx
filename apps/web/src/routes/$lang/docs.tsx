import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { TanstackProvider } from "fumadocs-core/framework/tanstack";
import { defineI18nUI } from "fumadocs-ui/i18n";
import { RootProvider } from "fumadocs-ui/provider/tanstack";

import { docsI18nConfig } from "@/lib/docs/i18n";

const { provider } = defineI18nUI(docsI18nConfig, {
  translations: {
    cn: {
      displayName: "Chinese",
      search: "Translated Content",
    },
    en: {
      displayName: "English",
    },
  },
});

function DocsLayout() {
  const { lang = docsI18nConfig.defaultLanguage } = useParams({ strict: false });

  return (
    <TanstackProvider>
      <RootProvider i18n={provider(lang)} theme={{ enabled: false }}>
        <Outlet />
      </RootProvider>
    </TanstackProvider>
  );
}

export const Route = createFileRoute("/$lang/docs")({
  component: DocsLayout,
});
