import { useEffect, useEffectEvent, useId, useState } from "react";
import type { ModelCatalog, ModelSelection } from "@raypx/core/tasks";
import type { TaskWorkspacePort } from "../model/port.js";
import { useTranslations } from "@raypx/i18n/browser";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { SelectField } from "@raypx/ui/select-field";
import { IconButton } from "@raypx/ui/icon-button";
import { SaveIcon } from "@raypx/icons/save";
import { RefreshIcon } from "@raypx/icons/refresh";

type ModelPort = NonNullable<TaskWorkspacePort["models"]>;
const key = (model: ModelSelection) =>
  JSON.stringify([model.provider, model.model, model.connectionId]);
export function ModelPicker({
  client,
  value,
  onChange,
  onReady,
  disabled,
}: {
  client: ModelPort;
  value: ModelSelection | undefined;
  onChange: (model: ModelSelection) => void;
  onReady?: (ready: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("tasks"),
    id = useId();
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<{
    client: ModelPort;
    revision: number;
    catalog?: ModelCatalog;
    failed?: boolean;
  }>();
  const active = loaded?.client === client && loaded.revision === reload ? loaded : undefined;
  const catalog = active?.catalog,
    loading = !active;
  const [failed, setFailed] = useState(false),
    [saving, setSaving] = useState(false);
  const received = useEffectEvent((next: ModelCatalog, source: ModelPort, revision: number) => {
    if (source !== client || revision !== reload) return;
    setLoaded({ client: source, revision, catalog: next });
    if (!value && next.default) onChange(next.default);
  });
  useEffect(() => {
    const controller = new AbortController();
    void client
      .list({}, { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) received(next, client, reload);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ client, revision: reload, failed: true });
      });
    return () => controller.abort();
  }, [client, reload]);
  const selected = value && catalog?.models.find((model) => key(model.selection) === key(value));
  const readiness = useEffectEvent((ready: boolean) => onReady?.(ready));
  useEffect(() => {
    readiness(Boolean(selected?.configured) && !loading);
  }, [selected?.configured, loading]);
  const save = async () => {
    if (!value || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await client.setDefault({ model: value });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("model")}</FieldLabel>
      <div className="flex items-center gap-2">
        <SelectField
          id={id}
          value={value ? key(value) : null}
          disabled={disabled || loading || !catalog}
          placeholder={t("chooseModel")}
          required
          onValueChange={(chosen) => {
            const model = catalog?.models.find((entry) => key(entry.selection) === chosen);
            if (model) onChange(model.selection);
          }}
          options={
            catalog?.models
              .filter((model) => model.configured || (value && key(model.selection) === key(value)))
              .map((model) => ({
                value: key(model.selection),
                label: model.provider + " · " + model.name,
                disabled: !model.configured,
              })) ?? []
          }
        />
        <IconButton
          label={t("saveModelDefault")}
          disabled={disabled || loading || saving || !selected?.configured}
          onClick={() => void save()}
        >
          <SaveIcon />
        </IconButton>
        <IconButton
          label={t("reloadModels")}
          disabled={disabled || loading}
          onClick={() => {
            setFailed(false);
            setReload((revision) => revision + 1);
          }}
        >
          <RefreshIcon />
        </IconButton>
      </div>
      {selected && <span className="text-xs text-muted-foreground">{selected.origin}</span>}
      {!selected?.configured && (
        <span role="status" className="text-xs text-muted-foreground">
          {t("modelConfigurationHint")}
        </span>
      )}
      {(failed || active?.failed) && (
        <span role="alert" className="text-sm text-destructive">
          {t("AI_INVALID_CONFIG")}
        </span>
      )}
    </Field>
  );
}
