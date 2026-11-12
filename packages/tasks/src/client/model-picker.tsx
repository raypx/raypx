import { useTranslations } from "./i18n.js";
import { useEffect, useEffectEvent, useId, useState } from "react";
import type { ModelCatalog, ModelSelection } from "@raypx/core/tasks";
import { normalizeSearchText } from "@raypx/i18n";
import type { TaskWorkspacePort } from "../model/port.js";

import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@raypx/ui/components/ui/combobox";
import { Badge } from "@raypx/ui/components/ui/badge";
import { cn } from "@raypx/ui/lib/utils";
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
  onPending,
  disabled,
  compact = false,
}: {
  client: ModelPort;
  value: ModelSelection | undefined;
  onChange: (model: ModelSelection) => void;
  onReady?: (ready: boolean) => void;
  onPending?: (pending: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const common = useTranslations("common");
  const t = useTranslations("tasks"),
    id = useId();
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
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
  const readiness = useEffectEvent((ready: boolean, pending: boolean) => {
    onReady?.(ready);
    onPending?.(pending);
  });
  useEffect(() => {
    readiness(Boolean(selected?.configured) && !loading, loading);
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
  const available =
    catalog?.models.filter(
      (model) => model.configured || (value && key(model.selection) === key(value)),
    ) ?? [];
  const groups = [...new Set(available.map((model) => model.provider))].map((provider) => ({
    label: provider,
    items: available.filter((model) => model.provider === provider),
  }));
  type CatalogModel = ModelCatalog["models"][number];
  return (
    <Field className="min-w-0">
      <FieldLabel id={`${id}-label`} htmlFor={id} className={compact ? "sr-only" : undefined}>
        {t("model")}
      </FieldLabel>
      <div className="flex min-w-0 items-center gap-1">
        <Combobox<CatalogModel>
          items={groups}
          value={selected ?? null}
          inputValue={query}
          onInputValueChange={setQuery}
          onOpenChange={(open) => {
            if (!open) setQuery("");
          }}
          disabled={disabled || loading || !catalog}
          itemToStringLabel={(model) => `${model.provider} · ${model.name}`}
          itemToStringValue={(model) => key(model.selection)}
          isItemEqualToValue={(a, b) => key(a.selection) === key(b.selection)}
          filter={(model, search) =>
            normalizeSearchText(`${model.provider} ${model.name} ${model.origin}`).includes(
              normalizeSearchText(search),
            )
          }
          onValueChange={(model) => {
            if (model?.configured) onChange(model.selection);
          }}
        >
          <ComboboxTrigger
            id={id}
            aria-labelledby={`${id}-label`}
            size={compact ? "sm" : "default"}
            className={cn("min-w-0 flex-1", compact && "max-w-80")}
          >
            <span className="truncate">
              {selected
                ? `${selected.provider} · ${selected.name}`
                : value
                  ? `${value.provider} · ${value.model}`
                  : t("chooseModel")}
            </span>
          </ComboboxTrigger>
          <ComboboxContent aria-labelledby={`${id}-label`} className="min-w-64">
            <div className="p-1">
              <ComboboxInput aria-label={t("searchModels")} placeholder={t("searchModels")} />
            </div>
            <ComboboxEmpty>{t("noModelsMatch")}</ComboboxEmpty>
            <ComboboxList>
              {(group: { label: string; items: CatalogModel[] }) => (
                <ComboboxGroup key={group.label} items={group.items}>
                  <ComboboxLabel>{group.label}</ComboboxLabel>
                  <ComboboxCollection>
                    {(model: CatalogModel) => (
                      <ComboboxItem
                        key={key(model.selection)}
                        value={model}
                        disabled={!model.configured}
                        aria-label={`${model.provider} · ${model.name} · ${model.origin}`}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate">{model.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {model.origin}
                          </span>
                        </span>
                        {!model.configured && (
                          <Badge variant="outline">{common("unconfigured")}</Badge>
                        )}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                </ComboboxGroup>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <IconButton
          size={compact ? "icon-sm" : "icon"}
          label={t("saveModelDefault")}
          disabled={disabled || loading || saving || !selected?.configured}
          onClick={() => void save()}
        >
          <SaveIcon />
        </IconButton>
        <IconButton
          size={compact ? "icon-sm" : "icon"}
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
      {loading && !onPending && (
        <span role="status" className="text-xs text-muted-foreground">
          {t("modelChecking")}
        </span>
      )}
      {selected && !compact && (
        <span className="truncate text-xs text-muted-foreground">{selected.origin}</span>
      )}
      {!loading && !selected?.configured && (
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
