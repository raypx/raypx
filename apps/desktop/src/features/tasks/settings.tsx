import { agentProviderMetadata, agentProviders } from "@raypx/core/tasks";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { Badge } from "@raypx/ui/components/ui/badge";
import { HelpHint } from "@raypx/ui/help-hint";
import { cn } from "@raypx/ui/lib/utils";
import type { DeviceProject } from "@raypx/contracts/tasks";
import type { AgentCapability } from "@raypx/core/tasks";
import { LOCAL_WORKSPACE_ID, type RootGrant } from "@raypx/contracts/local";
import type { ControlInfo } from "@raypx/contracts/terminal";
import {
  getBridge,
  isDesktop,
  hasTerminalHooks,
  localRequest,
  pickDirectory,
} from "../../lib/desktop.js";
import { authClient } from "../auth/client.js";
import { CloudTerminalSettings } from "./cloud-terminal-settings.js";
import { TerminalSettings } from "./terminal-settings.js";
import { ReauthorizeHost } from "./reauthorize.js";
import { RemoteBoundary } from "../auth/components/remote-boundary.js";
import { Link } from "@tanstack/react-router";
import { CompassIcon } from "@raypx/icons/compass";

export function AgentSettings() {
  const t = useTranslations("tasks");
  const session = authClient.useSession();
  const accountId = session.isPending || session.error ? undefined : session.data?.user.id;
  const localText = useTranslations("localWorkspace");
  const [remoteInfo, setRemoteInfo] = useState<{
    account: string | undefined;
    value: ControlInfo | undefined;
  }>();
  const info = remoteInfo?.account === accountId ? remoteInfo?.value : undefined;
  const [roots, setRoots] = useState<RootGrant[]>([]);
  const [projects, setProjects] = useState<DeviceProject[]>([]);
  const [capabilities, setCapabilities] = useState<AgentCapability[]>([]);
  const [busy, setBusy] = useState(false);
  // "unavailable" comes from polling and clears on the next successful read.
  const [error, setError] = useState<"unavailable" | "local" | "remote" | false>(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const refresh = useCallback(async () => {
    if (!isDesktop()) return;
    const bridge = await getBridge();
    const [next, folders, configured, agents] = await Promise.all([
      accountId ? bridge.request.controlInfo({ accountId }) : Promise.resolve(undefined),
      localRequest("roots.list", {}),
      localRequest("agents.projects", {}),
      localRequest("agents.capabilities", {}),
    ]);
    setRemoteInfo({ account: accountId, value: next });
    setRoots(folders);
    setProjects(configured);
    setCapabilities(agents);
  }, [accountId]);
  useEffect(() => {
    let active = true;
    const read = () => {
      if (active)
        void refresh().then(
          () => {
            if (active) setError((value) => (value === "unavailable" ? false : value));
          },
          () => {
            if (active) setError("unavailable");
          },
        );
    };
    read();
    const timer = setInterval(read, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refresh]);
  async function change(action: () => Promise<unknown>, scope: "local" | "remote" = "local") {
    setBusy(true);
    setError(false);
    try {
      await action();
      window.dispatchEvent(new Event("raypx:remote-change"));
      await refresh();
    } catch {
      setError(scope);
    } finally {
      setBusy(false);
    }
  }
  if (!isDesktop()) return null;
  return (
    <section data-tasks className="border-b border-border py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h2 className="text-base">{t("agentSettings")}</h2>
            <HelpHint label={t("localWorkHelp")} description={localText("ownershipHint")} />
          </div>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{t("localSetupHint")}</p>
        </div>
        <Link to="/welcome" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          <CompassIcon aria-hidden="true" />
          {localText("getStarted")}
        </Link>
      </div>
      {info?.daemon && (
        <p className="mt-3 max-w-[65ch] text-sm text-muted-foreground">{t("daemonHint")}</p>
      )}
      <div className="mt-5 flex items-center gap-1">
        <h3 className="text-sm font-medium">{t("agent")}</h3>
        <HelpHint label={t("agentHelp")} description={t("cliHint")} />
      </div>
      <ul aria-label={t("agent")} className="mt-2 grid gap-2 sm:grid-cols-2">
        {capabilities.map((capability) => (
          <li
            key={capability.provider}
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm"
          >
            <div className="min-w-0">
              <h4 className="font-medium">{agentProviderMetadata[capability.provider].label}</h4>
              {capability.version && (
                <p className="mt-0.5 text-xs text-muted-foreground wrap-anywhere">
                  {capability.version}
                </p>
              )}
            </div>
            <Badge variant="outline">{t(capability.reason)}</Badge>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-sm font-medium">{t("projects")}</h3>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void change(async () => {
              const root = await pickDirectory();
              if (root)
                await localRequest("agents.configure", {
                  rootId: root.id,
                  providers: [...agentProviders],
                });
            })
          }
        >
          {t("authorize")}
        </Button>
      </div>
      {!roots.length && <p className="mt-3 text-sm text-muted-foreground">{t("noProjects")}</p>}
      {roots.map((root) => (
        <div
          key={root.id}
          className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-4"
        >
          <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{root.name}</span>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void change(() =>
                localRequest("agents.configure", {
                  rootId: root.id,
                  providers: projects.some((project) => project.id === root.id)
                    ? []
                    : [...agentProviders],
                }),
              )
            }
          >
            {t(
              projects.some((project) => project.id === root.id)
                ? "disableProject"
                : "enableProject",
            )}
          </Button>
        </div>
      ))}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium">{t("localHistory")}</h3>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{t("clearHistoryHint")}</p>
        </div>
        <Button
          variant={confirmClear ? "destructive" : "outline"}
          disabled={busy}
          onBlur={() => setConfirmClear(false)}
          onClick={() => {
            if (!confirmClear) return setConfirmClear(true);
            setConfirmClear(false);
            void change(() =>
              localRequest("agents.local.clear", { accountId: LOCAL_WORKSPACE_ID }),
            );
          }}
        >
          {t(confirmClear ? "confirmClearHistory" : "clearHistory")}
        </Button>
      </div>
      {(error === "unavailable" || error === "local") && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t("LOCAL_UNAVAILABLE")}
        </p>
      )}
      {hasTerminalHooks() && <TerminalSettings projects={projects} />}
      <div className="mt-8 border-t border-border pt-7">
        <RemoteBoundary>
          {() =>
            accountId && (
              <>
                <h3 className="text-base">{t("remoteTitle")}</h3>
                <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("remoteHint")}</p>
                <div className="my-5 flex flex-wrap items-center gap-4">
                  <Button
                    disabled={busy || !info}
                    variant={info?.enabled ? "outline" : "default"}
                    onClick={() =>
                      void change(
                        async () =>
                          (await getBridge()).request.controlEnable({
                            accountId,
                            enabled: !info?.enabled,
                          }),
                        "remote",
                      )
                    }
                  >
                    {t(info?.enabled ? "disconnect" : "connect")}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {t(info?.connected ? "online" : "offline")}
                  </span>
                </div>
                {(error === "remote" || info?.error) && (
                  <p role="alert" className="mt-3 text-sm text-destructive">
                    {t(
                      info?.error === "AUTH_REQUIRED" || info?.error === "UNAUTHORIZED"
                        ? "daemonAuthorizationRequired"
                        : "NETWORK_UNAVAILABLE",
                    )}
                  </p>
                )}
                {info?.daemon &&
                  (info.error === "AUTH_REQUIRED" || info.error === "UNAUTHORIZED") &&
                  session.data?.user.email && (
                    <ReauthorizeHost key={accountId} email={session.data.user.email} />
                  )}
                {info?.daemon && (
                  <CloudTerminalSettings
                    supported={info.terminalSupported !== false}
                    key={accountId}
                    accountId={accountId}
                    projects={projects}
                  />
                )}
              </>
            )
          }
        </RemoteBoundary>
      </div>
    </section>
  );
}
