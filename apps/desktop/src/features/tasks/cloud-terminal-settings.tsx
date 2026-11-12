import { useTranslations } from "../../i18n.js";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { DeviceProject } from "@raypx/contracts/tasks";
import { Alert, AlertAction, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Switch } from "@raypx/ui/components/ui/switch";
import { getBridge, localRequest } from "../../lib/desktop.js";

type Settings = { enabled: boolean; rootIds: string[] };
type Props = { accountId: string; projects: DeviceProject[]; supported?: boolean };

export function CloudTerminalSettings(props: Props) {
  // Unmount the previous account's drafts and in-flight reads before rendering another account.
  return <AccountTerminalSettings key={props.accountId} {...props} />;
}

function AccountTerminalSettings({ accountId, projects, supported = true }: Props) {
  const t = useTranslations("terminal"),
    c = useTranslations("common"),
    id = useId();
  const [value, setValue] = useState<Settings>();
  const [localRoots, setLocalRoots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [readError, setReadError] = useState(false),
    [saveError, setSaveError] = useState(false);
  const mounted = useRef(false);
  const readVersion = useRef(0);
  const editVersion = useRef(0);
  const dirty = useRef(false);
  const roots = useRef<string[]>([]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reload = useCallback(async () => {
    const request = ++readVersion.current;
    const revision = editVersion.current;
    setLoading(true);
    setReadError(false);
    try {
      const [settings, local] = await Promise.all([
        getBridge().then((bridge) => bridge.request.terminalSettings({ accountId })),
        localRequest("approvals.local.settings", {}),
      ]);
      if (!mounted.current || request !== readVersion.current) return;
      roots.current = local.rootIds;
      setLocalRoots(local.rootIds);
      setValue((old) => {
        const next = old && (dirty.current || revision !== editVersion.current) ? old : settings;
        return { ...next, rootIds: next.rootIds.filter((root) => local.rootIds.includes(root)) };
      });
    } catch {
      if (mounted.current && request === readVersion.current) setReadError(true);
    } finally {
      if (mounted.current && request === readVersion.current) setLoading(false);
    }
  }, [accountId]);
  const projectIds = projects
    .map((project) => project.id)
    .sort()
    .join(",");
  useEffect(() => {
    const refresh = () => void reload();
    refresh();
    window.addEventListener("raypx:terminal-settings", refresh);
    return () => window.removeEventListener("raypx:terminal-settings", refresh);
  }, [projectIds, reload]);
  function edit(next: Settings) {
    dirty.current = true;
    editVersion.current++;
    setValue(next);
  }
  async function save() {
    if (!value || busy || !supported) return;
    setBusy(true);
    setSaveError(false);
    try {
      const bridge = await getBridge();
      if (!mounted.current) return;
      const settings = await bridge.request.terminalConfigure({
        accountId,
        ...value,
        rootIds: value.rootIds.filter((root) => roots.current.includes(root)),
      });
      if (!mounted.current) return;
      editVersion.current++;
      dirty.current = false;
      setValue({
        ...settings,
        rootIds: settings.rootIds.filter((root) => roots.current.includes(root)),
      });
    } catch {
      if (mounted.current) setSaveError(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="mt-6 space-y-4" aria-labelledby={id} aria-busy={loading || busy}>
      <h4 id={id} className="text-sm font-medium">
        {t("settings.cloud")}
      </h4>
      <p className="max-w-[65ch] text-sm text-muted-foreground">{t("settings.cloudHint")}</p>
      {!supported && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("settings.upgrade")}
        </p>
      )}
      {loading && !value && (
        <p role="status" className="text-sm text-muted-foreground">
          {c("loading")}
        </p>
      )}
      {value && (
        <>
          <label className="flex items-center justify-between gap-4 text-sm">
            {t("settings.cloud")}
            <Switch
              checked={value.enabled}
              disabled={busy || !supported}
              onCheckedChange={(enabled) => edit({ ...value, enabled })}
            />
          </label>
          {projects
            .filter((project) => localRoots.includes(project.id))
            .map((project) => (
              <label key={project.id} className="flex min-h-9 items-center gap-3 text-sm">
                <Checkbox
                  checked={value.rootIds.includes(project.id)}
                  disabled={busy || !supported}
                  onCheckedChange={(checked) =>
                    edit({
                      ...value,
                      rootIds: checked
                        ? [...value.rootIds, project.id]
                        : value.rootIds.filter((root) => root !== project.id),
                    })
                  }
                />
                {project.name}
              </label>
            ))}
          <Button disabled={busy || loading || readError || !supported} onClick={() => void save()}>
            {busy ? c("working") : t("settings.save")}
          </Button>
        </>
      )}
      {readError && (
        <Alert variant="destructive">
          <AlertDescription>{t("settings.failed")}</AlertDescription>
          <AlertAction>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading || busy}
              onClick={() => void reload()}
            >
              {c("retry")}
            </Button>
          </AlertAction>
        </Alert>
      )}
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{t("settings.failed")}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
