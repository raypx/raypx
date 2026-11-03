import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";
import { PlusIcon } from "@raypx/icons/plus";
import { SaveIcon } from "@raypx/icons/save";
import { SendIcon } from "@raypx/icons/send";
import type { ComposerDraftStatus } from "../../model/composer.js";

/** New/save draft actions, Send and the draft storage notice. */
export function ComposerDraftActions({
  busy,
  empty,
  prompted,
  sendable,
  guest,
  draftsReady,
  status,
  storageFailed,
  onNew,
  onSave,
}: {
  busy: boolean;
  /** Neither text nor an opened draft remains to replace. */
  empty: boolean;
  prompted: boolean;
  sendable: boolean;
  guest: boolean;
  draftsReady: boolean;
  status: ComposerDraftStatus | null;
  storageFailed: boolean;
  onNew: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("tasks");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-1">
          <IconButton
            size="icon-sm"
            type="button"
            label={t("newDraft")}
            disabled={busy || empty}
            onClick={onNew}
          >
            <PlusIcon aria-hidden="true" />
          </IconButton>
          <IconButton
            size="icon-sm"
            type="button"
            label={t("saveDraft")}
            hint={t("draftDeviceOnly")}
            disabled={busy || !draftsReady || !prompted}
            onClick={onSave}
          >
            <SaveIcon aria-hidden="true" />
          </IconButton>
        </div>
        <Button type="submit" disabled={!sendable}>
          <SendIcon aria-hidden="true" />
          {t(busy ? "sending" : guest ? "signInToSend" : "send")}
        </Button>
      </div>
      {(status || storageFailed) && (
        <p
          role={status === "draftSaved" ? "status" : "alert"}
          className={
            status === "draftSaved"
              ? "text-xs text-muted-foreground"
              : "text-xs text-destructive-text"
          }
        >
          {t(status ?? "draftSaveFailed")}
        </p>
      )}
    </>
  );
}
