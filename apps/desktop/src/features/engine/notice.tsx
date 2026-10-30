import { useState } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { useConfirmation } from "@raypx/ui/confirmation";
import { useTranslations } from "@raypx/i18n/browser";

export function EngineNotice({
  code,
  restart,
}: {
  code: string | undefined;
  restart: (replace: boolean) => Promise<boolean>;
}) {
  const t = useTranslations("engine"),
    common = useTranslations("common"),
    confirmation = useConfirmation();
  const [busy, setBusy] = useState(false);
  const upgrade = code === "HOST_VERSION_MISMATCH";
  async function recover() {
    if (
      upgrade &&
      !(await confirmation.confirm({
        title: t("upgradeTitle"),
        description: t("upgradeWarning"),
        confirmLabel: t("replaceOwner"),
        cancelLabel: common("cancel"),
      }))
    )
      return;
    setBusy(true);
    try {
      await restart(upgrade);
    } catch {
      /* The persistent notice remains available for retry. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div
        className="flex flex-wrap items-center justify-between gap-5 bg-muted px-8 py-4 @max-2xl/main:px-5"
        role="alert"
      >
        <div>
          <strong className="text-sm font-medium">
            {t(upgrade ? "upgradeTitle" : "unavailable")}
          </strong>
          <p className="mt-1 max-w-[65ch] text-xs text-muted-foreground">
            {t(upgrade ? "upgradeWarning" : "hint")}
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void recover()}>
          {t(upgrade ? "replaceOwner" : "retry")}
        </Button>
      </div>
      {confirmation.dialog}
    </>
  );
}
