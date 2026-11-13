import { CheckIcon } from "@raypx/icons/check";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "../../../i18n.js";

export function ConfigurationActions({
  busy,
  saving,
  dirty,
  saved,
  canSave,
  onDiscard,
}: {
  busy: boolean;
  saving: boolean;
  dirty: boolean;
  saved: boolean;
  canSave: boolean;
  onDiscard: () => void;
}) {
  const t = useTranslations("site");
  const common = useTranslations("common");

  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!canSave}>
          {t(saving ? "saving" : "save")}
        </Button>
        <Button type="button" variant="outline" disabled={busy || !dirty} onClick={onDiscard}>
          {common("discard")}
        </Button>
      </div>
      {saved && (
        <span
          role="status"
          className="inline-flex items-center gap-1.5 text-sm font-medium motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 motion-safe:ease-out"
        >
          <CheckIcon className="size-4" aria-hidden="true" />
          {t("saved")}
        </span>
      )}
      {dirty && !saved && <span className="text-sm text-muted-foreground">{t("unsaved")}</span>}
    </div>
  );
}
