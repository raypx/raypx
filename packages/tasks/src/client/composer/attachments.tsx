import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileTextIcon } from "@raypx/icons/file-text";
import { CloseIcon } from "@raypx/icons/close";
import { Button } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";
import { useTranslations } from "../i18n.js";
import type { TaskContextSelection } from "@raypx/core/tasks";
import type { TaskWorkspacePort } from "../../model/port.js";
import type { TaskFailureCode } from "../../model/failure.js";

export function ComposerAttachments({
  client,
  scope,
  selection,
  busy,
  uploading,
  error,
  onAdd,
  onRemove,
}: {
  client: NonNullable<TaskWorkspacePort["attachments"]>;
  scope: string;
  selection: TaskContextSelection | undefined;
  busy: boolean;
  uploading: boolean;
  error: TaskFailureCode | undefined;
  onAdd: (file: File) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("tasks");
  const input = useRef<HTMLInputElement>(null);
  const status = useQuery({
    queryKey: ["session-attachment-status", scope],
    queryFn: ({ signal }) => client.status({}, { signal }),
    retry: false,
    staleTime: 30_000,
  });
  const sources = selection?.sources ?? [];
  const selected = sources.filter((source) => source.attachment !== undefined);
  const enabled = status.data?.enabled === true;
  if (!enabled && !selected.length && !error) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      {enabled && (
        <>
          <input
            ref={input}
            type="file"
            hidden
            aria-label={t("attachFile")}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) onAdd(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy || sources.length >= 8}
            onClick={() => input.current?.click()}
          >
            <FileTextIcon data-icon="inline-start" aria-hidden="true" />
            {t(uploading ? "uploadingAttachment" : "attachFile")}
          </Button>
        </>
      )}
      {selected.length > 0 && (
        <ul aria-label={t("attachments")} className="flex max-w-full flex-wrap gap-2">
          {selected.map(({ id, attachment }) => (
            <li
              key={id}
              className="flex min-w-0 items-center gap-1 rounded-md border border-border pl-2"
            >
              <span className="min-w-0 truncate text-xs">{attachment}</span>
              <IconButton
                size="icon-sm"
                label={t("removeAttachment", { name: attachment! })}
                disabled={busy}
                onClick={() => onRemove(id)}
              >
                <CloseIcon aria-hidden="true" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {uploading && (
        <span className="sr-only" role="status">
          {t("uploadingAttachment")}
        </span>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(error)}
        </p>
      )}
    </div>
  );
}
