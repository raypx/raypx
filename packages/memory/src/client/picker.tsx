import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { TaskContextSelection, TaskContextTarget } from "@raypx/core/tasks";
import type { ContextDocument, ContextDocumentSummary } from "@raypx/memory-model";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Badge } from "@raypx/ui/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import type { MemoryClientPort } from "./port.ts";
import { memoryClientKey, memoryFailure, useMemoryRequests } from "./request.ts";
interface Props {
  client: MemoryClientPort;
  ownerKey: string;
  target: TaskContextTarget;
  value: TaskContextSelection;
  onChange: (selection: TaskContextSelection) => void;
  disabled?: boolean;
}
export function ContextPicker(props: Props) {
  return (
    <Picker
      key={JSON.stringify([props.ownerKey, memoryClientKey(props.client), props.target])}
      {...props}
    />
  );
}
function Picker({ client, target, value, onChange, disabled }: Props) {
  const id = useId();
  const t = useTranslations("memory"),
    c = useTranslations("common");
  const { isActive, request } = useMemoryRequests();
  const [documents, setDocuments] = useState<ContextDocumentSummary[]>();
  const [preview, setPreview] = useState<ContextDocument>();
  const [listError, setListError] = useState<ReturnType<typeof memoryFailure>>();
  const [previewError, setPreviewError] = useState<ReturnType<typeof memoryFailure>>();
  const [loading, setLoading] = useState(true);
  const previewGeneration = useRef(0);
  const loadGeneration = useRef(0);
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const result = await request((options) => client.list({}, options));
      if (isActive() && generation === loadGeneration.current) {
        setDocuments(
          result.filter(
            (document) =>
              !document.archived &&
              (!document.project ||
                (document.project.deviceId === target.deviceId &&
                  document.project.projectId === target.projectId)),
          ),
        );
        setListError(undefined);
      }
    } catch (failure) {
      if (isActive() && generation === loadGeneration.current) setListError(memoryFailure(failure));
    } finally {
      if (isActive() && generation === loadGeneration.current) setLoading(false);
    }
  }, [isActive, client, request, target.deviceId, target.projectId]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  function closePreview() {
    previewGeneration.current++;
    setPreview(undefined);
    setPreviewError(undefined);
  }
  async function show(document: ContextDocumentSummary) {
    const generation = ++previewGeneration.current;
    try {
      const revision =
        value.sources.find((source) => source.id === document.id)?.revision ?? document.revision;
      const result =
        revision === document.revision
          ? await request((options) => client.get({ id: document.id }, options))
          : (
              await request((options) =>
                client.history({ id: document.id, before: revision + 1, limit: 1 }, options),
              )
            )[0];
      if (
        !result ||
        result.id !== document.id ||
        result.revision !== revision ||
        result.archived ||
        (result.project &&
          (result.project.deviceId !== target.deviceId ||
            result.project.projectId !== target.projectId))
      ) {
        if (isActive() && generation === previewGeneration.current)
          setPreviewError("CONTEXT_REVISION_CONFLICT");
        return;
      }
      if (isActive() && generation === previewGeneration.current) {
        setPreview(result);
        setPreviewError(undefined);
      }
    } catch (failure) {
      if (isActive() && generation === previewGeneration.current)
        setPreviewError(memoryFailure(failure));
    }
  }
  const missing = value.sources.filter(
    (source) => !documents?.some((document) => document.id === source.id),
  );
  const error = previewError ?? listError;
  return (
    <Collapsible
      className="space-y-2"
      onOpenChange={(open) => {
        if (!open) closePreview();
      }}
    >
      <CollapsibleTrigger
        render={<Button type="button" variant="ghost" size="sm" className="group gap-2 px-0" />}
      >
        <ChevronDownIcon aria-hidden="true" className="group-data-panel-open:rotate-180" />
        {t("chooseContext")}
        <Badge variant="secondary" className="tabular-nums">
          ({value.sources.length}/8)
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3">
        <p className="max-w-[70ch] text-xs text-muted-foreground">{t("pickerHint")}</p>
        {loading && (
          <p role="status" className="text-xs">
            {c("loading")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive-text">
            {t(error)}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || disabled}
          onClick={() => {
            closePreview();
            setLoading(true);
            void load();
          }}
        >
          {c("refresh")}
        </Button>
        {documents?.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("pickerEmpty")}</p>
        )}
        <div className="max-h-80 overflow-y-auto overscroll-contain">
          {documents?.map((document) => {
            const source = value.sources.find((item) => item.id === document.id);
            const selected = Boolean(source);
            return (
              <div
                key={document.id}
                data-selected={selected || undefined}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-2 py-2 data-selected:bg-muted/50"
              >
                <label
                  htmlFor={`${id}-${document.id}`}
                  className="flex min-w-0 basis-48 flex-1 items-center gap-3 py-1 text-sm"
                >
                  <Checkbox
                    id={`${id}-${document.id}`}
                    checked={selected}
                    disabled={disabled || (!selected && value.sources.length >= 8)}
                    onCheckedChange={(checked) =>
                      onChange({
                        sources: checked
                          ? [
                              ...value.sources.filter((item) => item.id !== document.id),
                              { id: document.id, revision: document.revision },
                            ]
                          : value.sources.filter((item) => item.id !== document.id),
                      })
                    }
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="wrap-anywhere">{document.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums wrap-anywhere">
                      {t(document.kind)} ·{" "}
                      {t("revision", { revision: String(source?.revision ?? document.revision) })} ·{" "}
                      {document.category || t("uncategorized")}
                    </span>
                  </span>
                </label>
                {source && source.revision !== document.revision && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        sources: value.sources.map((item) =>
                          item.id === document.id
                            ? { id: document.id, revision: document.revision }
                            : item,
                        ),
                      })
                    }
                  >
                    {t("useRevision", { revision: String(document.revision) })}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => void show(document)}
                  aria-label={t("previewNamed", { name: document.name })}
                >
                  {t("preview")}
                </Button>
              </div>
            );
          })}
        </div>
        {Boolean(documents && missing.length) && (
          <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
            <p className="basis-full">{t("selectionUnavailable")}</p>
            {missing.map((source) => (
              <Button
                key={source.id}
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  onChange({ sources: value.sources.filter((item) => item.id !== source.id) })
                }
              >
                {t("removeRevision", { revision: String(source.revision) })}
              </Button>
            ))}
          </div>
        )}
        {preview && (
          <section className="space-y-2 border-t border-border pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="min-w-0 text-sm font-medium wrap-anywhere">
                {preview.name} · {t("revision", { revision: String(preview.revision) })}
              </h4>
              <Button type="button" size="sm" variant="ghost" onClick={closePreview}>
                {c("close")}
              </Button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
              {preview.content}
            </pre>
          </section>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
