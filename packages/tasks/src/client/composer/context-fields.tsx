import { useTranslations } from "../i18n.js";
import type { TaskContextSelection, TaskContextTarget } from "@raypx/core/tasks";
import {
  ContextBudget,
  ContextPicker,
  type ContextBudgetState,
  type MemoryClientPort,
} from "@raypx/memory/client";

/** Injected references for the selected target, with the budget that gates sending. */
export function ComposerContextFields({
  context,
  busy,
  targetFixed,
  onSelect,
  onBudget,
}: {
  context: {
    client: MemoryClientPort;
    ownerKey: string;
    target: TaskContextTarget;
    value: TaskContextSelection;
    prompt: string;
  };
  busy: boolean;
  targetFixed: boolean;
  onSelect: (selection: TaskContextSelection) => void;
  onBudget: (budget: ContextBudgetState) => void;
}) {
  const memoryText = useTranslations("memory");
  const references = context.value.sources.filter((source) => source.attachment === undefined);
  const attachments = context.value.sources.filter((source) => source.attachment !== undefined);
  return (
    <>
      <ContextPicker
        client={context.client}
        ownerKey={context.ownerKey}
        target={context.target}
        value={{ sources: references }}
        maxSources={8 - attachments.length}
        disabled={busy}
        onChange={({ sources }) => onSelect({ sources: [...sources, ...attachments] })}
      />
      {!targetFixed && (
        <p className="text-xs text-muted-foreground">{memoryText("selectionReset")}</p>
      )}
      <ContextBudget {...context} onChange={onBudget} />
    </>
  );
}
