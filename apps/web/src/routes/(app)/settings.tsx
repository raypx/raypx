import { authClient } from "../../features/auth/client.js";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { useTranslations } from "../../i18n.js";
import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { parseAgentSelection } from "@raypx/agents/model";
import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettings, LanguageSettings, SettingsPage } from "@raypx/blocks/settings";

export const Route = createFileRoute("/(app)/settings")({
  validateSearch: (search: Record<string, unknown>) =>
    parseAgentSelection({ spaceId: search.spaceId }),
  staticData: { page: { title: "common.settings", layout: "document" } },
  component: SettingsRoute,
});

function SettingsRoute() {
  const session = authClient.useSession();
  const common = useTranslations("common");
  const t = useTranslations("settings");
  return (
    <SettingsPage title={common("settings")} footnote={t("localHint")}>
      {session.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-8">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          <AppearanceSettings />
          <LanguageSettings />
          <AnalyticsSettings />
        </>
      )}
    </SettingsPage>
  );
}
