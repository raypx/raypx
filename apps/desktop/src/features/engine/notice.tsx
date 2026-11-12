import { useTranslations } from "../../i18n.js";
import { useState } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { useConfirmation } from "@raypx/ui/confirmation";

import { Alert, AlertTitle, AlertDescription } from "@raypx/ui/components/ui/alert";

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
      <Alert className="gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <AlertTitle>{t(upgrade ? "upgradeTitle" : "unavailable")}</AlertTitle>
          <AlertDescription className="mt-1 max-w-[65ch]">
            {t(upgrade ? "upgradeWarning" : "hint")}
          </AlertDescription>
        </div>
        <Button
          className="justify-self-start sm:self-center"
          variant="outline"
          disabled={busy}
          onClick={() => void recover()}
        >
          {t(upgrade ? "replaceOwner" : "retry")}
        </Button>
      </Alert>
      {confirmation.dialog}
    </>
  );
}
