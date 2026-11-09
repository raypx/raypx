import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { AppearanceSettings, LanguageSettings } from "@raypx/blocks/settings";
import { DeviceSettings } from "@raypx/tasks/client";
import { useTranslations } from "@raypx/i18n/browser";
import { RemoteBoundary } from "../auth/components/remote-boundary.tsx";
import { authClient } from "../auth/client.ts";
import { isDesktop } from "../../lib/desktop.ts";
import { AgentSettings } from "../tasks/settings.tsx";
import { taskClient } from "../tasks/client.ts";

export default function SettingsContent() {
  const t = useTranslations("settings");
  const session = authClient.useSession();
  const accountId = session.isPending || session.error ? null : session.data?.user.id;
  return (
    <>
      <section aria-label={t("device")} className="border-b border-border">
        <AppearanceSettings />
        <LanguageSettings />
      </section>
      <AgentSettings />
      <div className="border-b border-border">
        <AnalyticsSettings />
      </div>
      {accountId ? (
        <DeviceSettings client={taskClient} accountId={accountId} />
      ) : !isDesktop() ? (
        <RemoteBoundary>
          {(remoteAccount) => <DeviceSettings client={taskClient} accountId={remoteAccount} />}
        </RemoteBoundary>
      ) : null}
    </>
  );
}
