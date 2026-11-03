import { agentProviderMetadata } from "@raypx/core/tasks";
import type { SyncDevice } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { DeleteIcon } from "@raypx/icons/delete";
import { FileEditIcon } from "@raypx/icons/file-edit";
import type { TaskDraft } from "../../model/drafts.js";

/** Device-saved drafts; opening one only restores editor text. */
export function ComposerDraftList({
  drafts,
  devices,
  activeId,
  busy,
  onOpen,
  onDelete,
}: {
  drafts: TaskDraft[];
  devices: SyncDevice[];
  activeId: string | null;
  busy: boolean;
  onOpen: (draft: TaskDraft) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("tasks");
  if (!drafts.length) return null;
  return (
    <Collapsible render={<section aria-label={t("drafts")} />}>
      <CollapsibleTrigger
        aria-label={t("drafts")}
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group mb-2 w-full justify-start gap-2 text-muted-foreground"
          />
        }
      >
        <FileEditIcon aria-hidden="true" />
        {t("drafts")}
        <span className="text-xs tabular-nums">{drafts.length}</span>
        <ChevronDownIcon aria-hidden="true" className="ml-auto group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex items-center gap-1 px-1">
              <Button
                type="button"
                variant="ghost"
                aria-pressed={draft.id === activeId}
                className="h-auto min-h-12 min-w-0 flex-1 justify-start gap-2.5 px-2 py-2 text-left whitespace-normal"
                disabled={busy}
                onClick={() => onOpen(draft)}
              >
                <FileEditIcon aria-hidden="true" className="shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="line-clamp-1 text-sm">{draft.prompt}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {devices
                      .find((item) => item.id === draft.deviceId)
                      ?.projects.find((item) => item.id === draft.projectId)?.name ??
                      t("chooseProject")}{" "}
                    · {agentProviderMetadata[draft.provider].label}
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("deleteDraft", { name: draft.prompt.slice(0, 80) })}
                disabled={busy}
                onClick={() => onDelete(draft.id)}
              >
                <DeleteIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
