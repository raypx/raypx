import { useTranslations } from "../../i18n.js";
import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { AppearanceSettings, LanguageSettings } from "@raypx/blocks/settings";
import {
  ApprovalSettings,
  ModelConnections,
  McpServers,
  OpenApiServers,
} from "@raypx/agents/client";

import { getBridge, isDesktop } from "../../lib/desktop.js";
import { useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Button } from "@raypx/ui/components/ui/button";
import { authClient } from "../auth/client.js";
import { AccountSkills } from "./capabilities.js";
import { agentsClient } from "../agents/client.js";

export default function SettingsContent() {
  const t = useTranslations("settings");
  const models = useLocation({ select: (location) => location.hash === "settings/models" });
  const session = authClient.useSession();
  const accountId = !session.isPending && !session.error ? session.data?.user.id : undefined;
  return (
    <>
      <section aria-label={t("device")} className="border-b border-border">
        <AppearanceSettings />
        <LanguageSettings />
      </section>
      <SessionRecovery />
      {accountId && (
        <ApprovalSettings
          key={accountId}
          port={agentsClient.approvals}
          mcpServers={agentsClient.mcpServers}
          openApiServers={agentsClient.openApiServers}
          spaces={agentsClient.spaces}
        />
      )}
      {accountId && (
        <ModelConnections
          key={`models:${accountId}`}
          port={agentsClient.modelConnections}
          spaces={agentsClient.spaces}
          focus={models}
        />
      )}
      {accountId && <AccountSkills key={`skills:${accountId}`} accountId={accountId} />}
      {accountId && (
        <McpServers
          key={`tools:${accountId}`}
          port={agentsClient.mcpServers}
          spaces={agentsClient.spaces}
        />
      )}
      {accountId && (
        <OpenApiServers
          key={`apis:${accountId}`}
          port={agentsClient.openApiServers}
          spaces={agentsClient.spaces}
          agents={agentsClient.agents}
        />
      )}
      <div className="border-b border-border">
        <AnalyticsSettings />
      </div>
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
