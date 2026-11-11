import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { AppearanceSettings, LanguageSettings } from "@raypx/blocks/settings";
import { DeviceSettings } from "@raypx/tasks/client";
import { useTranslations } from "@raypx/i18n/browser";
import { RemoteBoundary } from "../auth/components/remote-boundary.tsx";
import { authClient } from "../auth/client.ts";
import { getBridge, isDesktop } from "../../lib/desktop.ts";
import { useState } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { AgentSettings } from "../tasks/settings.tsx";
import { taskClient } from "../tasks/client.ts";

export default function SettingsContent() {
  const t = useTranslations("settings");
  return (
    <>
      <section aria-label={t("device")} className="border-b border-border">
        <AppearanceSettings />
        <LanguageSettings />
      </section>
      <AgentSettings />
      <SessionRecovery />
      <div className="border-b border-border">
        <AnalyticsSettings />
      </div>
      <ConnectedDevicesSettings />
    </>
  );
}

function SessionRecovery() {
  const t = useTranslations("settings");
  const [busy, setBusy] = useState(false);
  if (!isDesktop()) return null;
  async function recover() {
    setBusy(true);
    try {
      await (await getBridge()).request.recoverSession({});
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="border-b border-border p-6">
      <Button variant="outline" disabled={busy} onClick={() => void recover().catch(() => {})}>
        {t("recoverSignIn")}
      </Button>
    </section>
  );
}

function ConnectedDevicesSettings() {
  const session = authClient.useSession();
  if (!session.isPending && !session.error && session.data?.user.id) {
    return <DeviceSettings client={taskClient} accountId={session.data.user.id} />;
  }
  if (isDesktop()) return null;
  return (
    <RemoteBoundary>
      {(accountId) => <DeviceSettings client={taskClient} accountId={accountId} />}
    </RemoteBoundary>
  );
}
