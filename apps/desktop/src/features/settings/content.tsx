import { useTranslations } from "../../i18n.js";
import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { AppearanceSettings, LanguageSettings, SettingsNavigation } from "@raypx/blocks/settings";
import {
  ApprovalSettings,
  ModelConnections,
  McpServers,
  OpenApiServers,
} from "@raypx/agents/client";
import { getBridge, isDesktop } from "../../lib/desktop.js";
import { useState } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { authClient } from "../auth/client.js";
import { AccountSkills } from "./capabilities.js";
import { agentsClient } from "../agents/client.js";
import { useSettingsNavigation } from "./navigation.js";

export default function SettingsContent() {
  const t = useTranslations("settings");
  const a = useTranslations("agents");
  const skills = useTranslations("skills");
  const analytics = useTranslations("analytics");
  const { section, open } = useSettingsNavigation();
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([section]));
  if (!visited.has(section)) setVisited(new Set([...visited, section]));
  const session = authClient.useSession();
  const accountId = !session.isPending && !session.error ? session.data?.user.id : undefined;
  const items = [
    { value: "preferences", label: t("device") },
    ...(accountId
      ? [
          { value: "approvals", label: a("approvalSettings.title") },
          { value: "models", label: a("connections.title") },
          { value: "skills", label: skills("title") },
          { value: "tools", label: a("workspaceSidebar.tools") },
        ]
      : []),
    { value: "diagnostics", label: analytics("title") },
  ];
  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[13rem_minmax(0,1fr)] md:grid-rows-1">
      <aside className="border-b border-border bg-muted/30 p-4 md:overflow-y-auto md:border-r md:border-b-0">
        <SettingsNavigation
          label={useTranslations("common")("settings")}
          value={section}
          items={items}
          onValueChange={(value) => {
            const next = items.find((item) => item.value === value);
            if (next) void open(next.value as typeof section);
          }}
        />
      </aside>
      <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-5 py-4 md:px-8">
        {visited.has("preferences") && (
          <section hidden={section !== "preferences"} className="@container/settings min-w-0">
            <h2 className="py-2 text-lg font-medium">{t("device")}</h2>
            <AppearanceSettings />
            <LanguageSettings />
            <p className="py-4 text-xs text-muted-foreground">{t("localHint")}</p>
            <SessionRecovery />
          </section>
        )}
        {visited.has("approvals") && accountId && (
          <div hidden={section !== "approvals"}>
            <ApprovalSettings
              key={accountId}
              port={agentsClient.approvals}
              mcpServers={agentsClient.mcpServers}
              openApiServers={agentsClient.openApiServers}
              spaces={agentsClient.spaces}
            />
          </div>
        )}
        {visited.has("models") && accountId && (
          <div hidden={section !== "models"}>
            <ModelConnections
              key={`models:${accountId}`}
              port={agentsClient.modelConnections}
              spaces={agentsClient.spaces}
            />
          </div>
        )}
        {visited.has("skills") && accountId && (
          <div hidden={section !== "skills"}>
            <AccountSkills key={`skills:${accountId}`} accountId={accountId} />
          </div>
        )}
        {visited.has("tools") && accountId && (
          <div hidden={section !== "tools"}>
            <McpServers
              key={`tools:${accountId}`}
              port={agentsClient.mcpServers}
              spaces={agentsClient.spaces}
            />
            <OpenApiServers
              key={`apis:${accountId}`}
              port={agentsClient.openApiServers}
              spaces={agentsClient.spaces}
              agents={agentsClient.agents}
            />
          </div>
        )}
        {visited.has("diagnostics") && (
          <div hidden={section !== "diagnostics"}>
            <AnalyticsSettings />
          </div>
        )}
      </div>
    </div>
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
