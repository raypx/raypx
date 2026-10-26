import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskContextSelection, TaskContextTarget } from "@raypx/core/tasks";
import type { ContextDocument, ContextDocumentSummary } from "../model.js";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { MemoryClientPort } from "./port.js";
import { memoryClientKey, memoryFailure, useMemoryRequests } from "./request.js";
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
  const t = useTranslations("memory"),
    c = useTranslations("common");
  const { isActive, request } = useMemoryRequests();
  const [documents, setDocuments] = useState<ContextDocumentSummary[]>();
  const [preview, setPreview] = useState<ContextDocument>();
  const [error, setError] = useState<ReturnType<typeof memoryFailure>>();
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
        setError(undefined);
      }
    } catch (failure) {
      if (isActive() && generation === loadGeneration.current) setError(memoryFailure(failure));
    } finally {
      if (isActive() && generation === loadGeneration.current) setLoading(false);
    }
  }, [isActive, client, request, target.deviceId, target.projectId]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
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
          setError("CONTEXT_REVISION_CONFLICT");
        return;
      }
      if (isActive() && generation === previewGeneration.current) setPreview(result);
    } catch (failure) {
      if (isActive()) setError(memoryFailure(failure));
    }
  }
  const missing = value.sources.filter(
    (source) => !documents?.some((document) => document.id === source.id),
  );
  return (
    <Collapsible className="space-y-2">
      <CollapsibleTrigger
        render={<Button type="button" variant="ghost" size="sm" className="group gap-2 px-0" />}
      >
        <ChevronDown aria-hidden="true" className="group-data-panel-open:rotate-180" />
        {t("chooseContext")} ({value.sources.length}/8)
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
            setLoading(true);
            void load();
          }}
        >
          {c("refresh")}
        </Button>
        {documents?.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("pickerEmpty")}</p>
        )}
        {documents?.map((document) => {
          const source = value.sources.find((item) => item.id === document.id);
          const selected = Boolean(source);
          return (
            <div key={document.id} className="flex items-center gap-3 border-t border-border py-2">
              <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                <Checkbox
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
                <span className="wrap-anywhere">
                  {document.name}
                  <span className="ml-2 text-xs text-muted-foreground">
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
        {Boolean(documents && missing.length) && (
          <div role="status" className="space-y-2 text-xs">
            <p>{t("selectionUnavailable")}</p>
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
          <section className="space-y-2">
            <h4 className="text-sm">
              {preview.name} · {t("revision", { revision: String(preview.revision) })}
            </h4>
            <pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap wrap-anywhere">
              {preview.content}
            </pre>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                previewGeneration.current++;
                setPreview(undefined);
              }}
            >
              {c("close")}
            </Button>
          </section>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
