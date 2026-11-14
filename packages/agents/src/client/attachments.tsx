import { useId, useState, useSyncExternalStore, type ClipboardEvent, type DragEvent } from "react";
import { useTranslations } from "./i18n.js";
import { InputGroupAddon } from "@raypx/ui/components/ui/input-group";
import { Button } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";
import { CloseIcon } from "@raypx/icons/close";
import type { MessageAttachment } from "@raypx/core/conversation";
import type { AttachmentsController, MessageAttachmentsPort } from "../model/attachments.js";
import type { ConversationSelection } from "../model/port.js";
const empty: readonly import("../model/attachments.js").AttachmentDraft[] = [];
const noSubscribe = () => () => {};
const emptySnapshot = () => empty;
const documentTypes =
  ".txt,.md,.csv,.json,.pdf,text/plain,text/markdown,text/csv,application/json,application/pdf";
const byExtension: Record<string, MessageAttachment["mediaType"]> = {
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
async function fileBytes(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function useAttachmentFiles(
  controller: AttachmentsController | undefined,
  supportsImages: boolean,
) {
  const t = useTranslations("agents");
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const items = useSyncExternalStore(
    controller?.subscribe ?? noSubscribe,
    controller?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  function add(files: FileList | File[]) {
    setError(null);
    if (!controller) return;
    for (const file of Array.from(files)) {
      const mediaType = byExtension[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? file.type;
      if (mediaType.startsWith("image/") && !supportsImages) {
        setError(t("attachments.imagesUnavailable"));
        continue;
      }
      if (controller.getSnapshot().length >= 4) {
        setError(t("attachments.limit"));
        break;
      }
      void controller.add({
        name: file.name,
        mediaType,
        size: file.size,
        read: () => fileBytes(file),
      });
    }
  }
  return {
    inputId,
    choose: (images = false) => {
      const input = document.getElementById(inputId);
      if (input instanceof HTMLInputElement) {
        let accept = documentTypes;
        if (supportsImages) accept += ",image/png,image/jpeg,image/gif,image/webp";
        if (images) accept = "image/png,image/jpeg,image/webp,image/gif";
        input.accept = accept;
        input.click();
      }
    },
    items,
    error,
    accept: supportsImages
      ? `${documentTypes},image/png,image/jpeg,image/gif,image/webp`
      : documentTypes,
    add,
    onPaste: (event: ClipboardEvent) => {
      if (event.clipboardData.files.length && controller) {
        event.preventDefault();
        event.stopPropagation();
        add(event.clipboardData.files);
      }
    },
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes("Files") && controller) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    },
    onDrop: (event: DragEvent) => {
      if (event.dataTransfer.files.length && controller) {
        event.preventDefault();
        event.stopPropagation();
        add(event.dataTransfer.files);
      }
    },
  };
}
export function AttachmentDrafts({
  controller,
  files,
  disabled,
}: {
  controller: AttachmentsController | undefined;
  files: ReturnType<typeof useAttachmentFiles>;
  disabled: boolean;
}) {
  const t = useTranslations("agents");
  if (!controller) return null;
  return (
    <InputGroupAddon
      align="block-start"
      className={
        files.items.length || files.error ? "flex-col items-stretch gap-1 px-3 pt-3 pb-0" : "hidden"
      }
    >
      <input
        id={files.inputId}
        type="file"
        multiple
        accept={files.accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={t("attachments.add")}
        disabled={disabled}
        onChange={(event) => {
          if (event.currentTarget.files) files.add(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <ul aria-label={t("attachments.title")} aria-live="polite" className="flex flex-wrap gap-2">
        {files.items.map((item) => (
          <li
            key={item.key}
            className="flex min-w-0 max-w-full items-center gap-1 rounded-lg border bg-muted/50 px-2 py-1 text-xs"
          >
            <span className="max-w-48 truncate">{item.name}</span>
            <span role="status">
              {item.state === "uploading" ? t("attachments.uploading") : null}
            </span>
            {item.error && <span role="alert">{t(`attachments.${item.error}`)}</span>}
            <IconButton
              size="icon-xs"
              label={t("attachments.remove", { name: item.name })}
              disabled={disabled}
              onClick={() => controller.remove(item.key)}
            >
              <CloseIcon aria-hidden="true" />
            </IconButton>
          </li>
        ))}
      </ul>
      {files.error && (
        <p role="alert" className="text-xs text-destructive">
          {files.error}
        </p>
      )}
    </InputGroupAddon>
  );
}
export function MessageAttachments({
  attachments,
  port,
  selection,
}: {
  attachments: readonly MessageAttachment[] | undefined;
  port: MessageAttachmentsPort | undefined;
  selection: ConversationSelection;
}) {
  const t = useTranslations("agents");
  const [error, setError] = useState(false);
  async function download(attachment: MessageAttachment) {
    if (!port) return;
    setError(false);
    try {
      const result = await port.download({ ...selection, id: attachment.id });
      const bytes = Uint8Array.from(atob(result.bytes), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.attachment.name;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError(true);
    }
  }
  if (!attachments?.length) return null;
  return (
    <div className="flex max-w-full flex-col gap-1">
      <ul aria-label={t("attachments.title")} className="flex flex-wrap justify-end gap-2">
        {attachments.map((attachment) => (
          <li key={attachment.id} className="flex min-w-0 max-w-full flex-col gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!port}
              aria-label={t("attachments.download", { name: attachment.name })}
              onClick={() => void download(attachment)}
            >
              <span className="max-w-48 truncate">{attachment.name}</span>
              <span className="text-xs text-muted-foreground">
                {Math.ceil(attachment.size / 1024)} KiB
              </span>
            </Button>
            {attachment.deliveries
              ?.filter((delivery) => delivery.state === "withheld")
              .map((delivery) => (
                <span key={delivery.runId} className="max-w-72 text-xs text-muted-foreground">
                  {t(`attachments.${delivery.reason ?? "COMPUTER_UNAVAILABLE"}`)}
                </span>
              ))}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {t("attachments.downloadError")}
        </p>
      )}
    </div>
  );
}
