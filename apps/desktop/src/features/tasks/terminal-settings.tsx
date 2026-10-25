import { useEffect, useId, useState } from "react";
import type { ControlInfo } from "@raypx/contracts/terminal";
import type { DeviceProject } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Switch } from "@raypx/ui/components/ui/switch";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { SelectField } from "@raypx/ui/select-field";
import { localRequest } from "../../lib/desktop";

type Settings = { rootIds: string[]; away: boolean; waitSeconds: number };
type Connector = {
  provider: "claude" | "codex";
  installed: boolean;
  modified: boolean;
  requiresTrust: boolean;
  error: string | null;
};
export function TerminalSettings({
  accountId,
  info,
  projects,
}: {
  accountId: string;
  info: ControlInfo;
  projects: DeviceProject[];
}) {
  const t = useTranslations("tasks"),
    c = useTranslations("common"),
    id = useId();
  const [settings, setSettings] = useState<Settings>(),
    [connectors, setConnectors] = useState<Connector[]>([]);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      localRequest<Settings>("observed.settings", { accountId }),
      localRequest<Connector[]>("connectors.status", {}),
    ]).then(
      ([value, hooks]) => {
        if (active) {
          setSettings(value);
          setConnectors(hooks);
          setDirty(false);
        }
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [accountId, info.authorized]);
  const update = (next: Partial<Settings>) => {
    setSettings((old) => (old ? { ...old, ...next } : old));
    setDirty(true);
    setSaved(false);
  };
  async function action(run: () => Promise<unknown>, save = false) {
    setBusy(true);
    setError(false);
    setSaved(false);
    try {
      await run();
      setConnectors(await localRequest<Connector[]>("connectors.status", {}));
      if (save) {
        setDirty(false);
        setSaved(true);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const durations = [
    ...new Set([
      ...Array.from({ length: 10 }, (_, index) => (index + 1) * 60),
      settings?.waitSeconds ?? 300,
    ]),
  ].sort((a, b) => a - b);
  return (
    <section aria-labelledby={`${id}-title`} className="mt-8 border-t border-border pt-7">
      <h3 id={`${id}-title`} className="text-base font-semibold">
        {t("terminalSettings")}
      </h3>
      <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("terminalSettingsHint")}</p>
      <ul className="mt-4 divide-y divide-border">
        {connectors.map((connector) => (
          <li
            key={connector.provider}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="text-sm font-medium">
                {connector.provider === "claude" ? "Claude Code" : "Codex"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(connector.installed ? "terminalInstalled" : "terminalNotInstalled")}
              </p>
              {(connector.modified || connector.error) && (
                <p className="mt-1 max-w-[65ch] text-xs text-destructive-text">
                  {t(
                    connector.error === "HOOK_SETTINGS_SYMLINK"
                      ? "terminalSettingsSymlink"
                      : "terminalSettingsConflict",
                  )}
                </p>
              )}
            </div>
            <Button
              disabled={busy || connector.modified || !!connector.error}
              variant="outline"
              onClick={() =>
                void action(() =>
                  localRequest(
                    connector.installed ? "connectors.uninstall" : "connectors.install",
                    { provider: connector.provider },
                  ),
                )
              }
            >
              {t(connector.installed ? "terminalUninstall" : "terminalInstall")}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-[65ch] text-xs text-muted-foreground">{t("terminalTrust")}</p>
      {settings && (
        <div className="mt-6 space-y-5">
          <div className="flex items-start justify-between gap-5">
            <div className="space-y-1">
              <label htmlFor={`${id}-away`} className="text-sm font-medium">
                {t("terminalAway")}
              </label>
              <p className="max-w-[65ch] text-sm text-muted-foreground">{t("terminalAwayHint")}</p>
            </div>
            <Switch
              id={`${id}-away`}
              checked={settings.away}
              onCheckedChange={(away) => update({ away })}
              disabled={busy || !info.authorized}
            />
          </div>
          <div className="max-w-xs space-y-2">
            <label htmlFor={`${id}-wait`} className="text-sm font-medium">
              {t("terminalWait")}
            </label>
            <SelectField
              id={`${id}-wait`}
              value={String(settings.waitSeconds)}
              options={durations.map((seconds) => ({
                value: String(seconds),
                label: t("terminalWaitMinutes", { minutes: seconds / 60 }),
              }))}
              disabled={busy || !info.authorized}
              onValueChange={(value) => update({ waitSeconds: Number(value) })}
            />
          </div>
          {!projects.length && (
            <p className="text-sm text-muted-foreground">{t("terminalNoProjects")}</p>
          )}
          <div className="space-y-3">
            {projects.map((project) => (
              <label key={project.id} className="flex min-h-9 items-center gap-3 text-sm">
                <Checkbox
                  checked={settings.rootIds.includes(project.id)}
                  disabled={busy || !info.authorized}
                  onCheckedChange={(checked) =>
                    update({
                      rootIds: checked
                        ? [...settings.rootIds, project.id]
                        : settings.rootIds.filter((value) => value !== project.id),
                    })
                  }
                />
                <span className="min-w-0 wrap-anywhere">
                  {t("terminalProject", { name: project.name })}
                </span>
              </label>
            ))}
          </div>
          <Button
            disabled={busy || !dirty || !info.authorized}
            onClick={() =>
              void action(
                () =>
                  localRequest("observed.configure", {
                    ...settings,
                    rootIds: settings.rootIds.filter((root) =>
                      projects.some((project) => project.id === root),
                    ),
                    accountId,
                  }),
                true,
              )
            }
          >
            {busy ? c("loading") : t("terminalSave")}
          </Button>
        </div>
      )}
      {info.authorized && !info.persistent && (
        <p role="status" className="mt-3 max-w-[65ch] text-sm text-muted-foreground">
          {t("daemonMemoryOnly")}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-3 text-sm">
          {t("terminalSaved")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive-text">
          {t("terminalUnavailable")}
        </p>
      )}
    </section>
  );
}
