import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { AgentSettings } from "../features/tasks/settings";
import { DeviceSettings } from "@raypx/tasks/client";
import { apiClient, authClient } from "../features/auth/client";
import { createFileRoute } from "@tanstack/react-router";
import { Languages } from "lucide-react";
import { ThemePicker, useTheme } from "@raypx/ui/theme/client";
import { LanguageSelect, useTranslations } from "@raypx/i18n/browser";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { theme, setTheme } = useTheme();
  const session = authClient.useSession();
  return (
    <section className="mx-auto max-w-[960px] px-14 pt-13 pb-20 max-[1100px]:px-8 max-[1100px]:pt-9 max-[1100px]:pb-14">
      <header className="mb-10">
        <h1>{t("title")}</h1>
        <p className="mt-[9px] max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      </header>
      <section className="flex items-start justify-between gap-8 border-b border-border pt-0 pb-8 max-[1100px]:flex-col max-[1100px]:gap-[22px]">
        <div>
          <h2 className="mb-1.5 text-[15px]">{t("appearance")}</h2>
          <p className="text-[13px] text-muted-foreground">{t("appearanceHint")}</p>
        </div>
        <ThemePicker
          value={theme}
          onValueChange={setTheme}
          label={t("appearance")}
          labels={{ light: c("light"), dark: c("dark"), system: c("system") }}
        />
      </section>
      <section className="flex items-start justify-between gap-8 border-b border-border pt-7 pb-8 max-[1100px]:flex-col max-[1100px]:gap-[22px]">
        <div>
          <h2 className="mb-1.5 text-[15px]">{t("language")}</h2>
          <p className="text-[13px] text-muted-foreground">{t("languageHint")}</p>
        </div>
        <LanguageSelect icon={<Languages size={18} />} />
      </section>
      <AgentSettings key={session.data?.user.id ?? "signed-out"} />
      <AnalyticsSettings />
      <DeviceSettings
        client={apiClient}
        accountId={session.data?.user.id ?? null}
        pending={session.isPending}
      />
      <p className="mt-6 text-xs text-muted-foreground">{t("localHint")}</p>
    </section>
  );
}
