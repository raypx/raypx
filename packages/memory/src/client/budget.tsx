import { useEffect, useState } from "react";
import {
  taskExecutionBudget,
  type TaskContextSelection,
  type TaskContextTarget,
} from "@raypx/core/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { ContextError, type ContextDocument } from "../index.js";
import type { MemoryClientPort } from "./port.js";
import { memoryClientKey, memoryFailure, useMemoryRequests } from "./request.js";

export interface ContextBudgetState {
  key: string;
  status: "loading" | "ready" | "error";
  exceeded: boolean;
}
interface Props {
  client: MemoryClientPort;
  ownerKey: string;
  target: TaskContextTarget;
  value: TaskContextSelection;
  prompt: string;
  onChange: (state: ContextBudgetState) => void;
}
export function contextBudgetKey(props: Omit<Props, "onChange">) {
  return JSON.stringify([
    props.ownerKey,
    memoryClientKey(props.client),
    props.target,
    props.value.sources,
    props.prompt,
  ]);
}
export function ContextBudget(props: Props) {
  return <Budget key={contextBudgetKey({ ...props, prompt: "" })} {...props} />;
}
function Budget(props: Props) {
  const t = useTranslations("memory");
  const { request, isActive } = useMemoryRequests();
  // The wrapper remounts on owner, client, target or selected revisions, never on typing.
  const [input] = useState(() => ({
    client: props.client,
    target: props.target,
    value: props.value,
  }));
  const [sources, setSources] = useState<ContextDocument[] | undefined>(
    input.value.sources.length ? undefined : [],
  );
  const [error, setError] = useState<ReturnType<typeof memoryFailure>>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!input.value.sources.length) return;
    let current = true;
    const matches = (document: ContextDocument) =>
      !document.project ||
      (document.project.deviceId === input.target.deviceId &&
        document.project.projectId === input.target.projectId);
    void Promise.all(
      input.value.sources.map(async (source) => {
        const document = await request((options) => input.client.get({ id: source.id }, options));
        if (document.archived) throw new ContextError("CONTEXT_ARCHIVED");
        if (document.id !== source.id || !matches(document))
          throw new ContextError("CONTEXT_PROJECT_MISMATCH");
        const version =
          document.revision === source.revision
            ? document
            : (
                await request((options) =>
                  input.client.history(
                    { id: source.id, before: source.revision + 1, limit: 1 },
                    options,
                  ),
                )
              )[0];
        if (!version || version.id !== source.id || version.revision !== source.revision)
          throw new ContextError("CONTEXT_REVISION_CONFLICT");
        if (!matches(version)) throw new ContextError("CONTEXT_PROJECT_MISMATCH");
        return version;
      }),
    )
      .then((result) => {
        if (current && isActive()) {
          setSources(result);
          setError(undefined);
        }
      })
      .catch((failure: unknown) => {
        if (current && isActive()) setError(memoryFailure(failure));
      });
    return () => {
      current = false;
    };
  }, [input, attempt, isActive, request]);
  const key = contextBudgetKey(props);
  const budget = sources
    ? taskExecutionBudget({ prompt: props.prompt, context: { sources } })
    : undefined;
  const status = error ? "error" : budget ? "ready" : "loading";
  const exceeded = budget?.exceeded ?? false;
  const onChange = props.onChange;
  useEffect(() => {
    onChange({ key, status, exceeded });
  }, [key, status, exceeded, onChange]);
  return (
    <div className="space-y-1 text-xs">
      {budget && (
        <output
          aria-label={t("promptBudget")}
          className={exceeded ? "text-destructive-text" : "text-muted-foreground"}
        >
          {t("budgetCount", { used: String(budget.characters), limit: String(budget.limit) })}
        </output>
      )}
      {!budget && !error && <p role="status">{t("budgetLoading")}</p>}
      {budget && exceeded && (
        <p role="alert" className="text-destructive-text">
          {t("budgetExceeded", { count: String(budget.characters - budget.limit) })}
        </p>
      )}
      {budget && !exceeded && budget.characters >= budget.limit * 0.9 && (
        <p role="status">{t("budgetNear", { count: String(budget.limit - budget.characters) })}</p>
      )}
      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-destructive-text">
            {t("budgetUnavailable")} {t(error)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setError(undefined);
              setSources(undefined);
              setAttempt((value) => value + 1);
            }}
          >
            {t("budgetRetry")}
          </Button>
        </div>
      )}
    </div>
  );
}
