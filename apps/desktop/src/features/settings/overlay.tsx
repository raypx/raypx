import { useTranslations } from "../../i18n.js";
import { lazy, Suspense } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@raypx/ui/components/ui/dialog";
import { LoadingState } from "@raypx/ui/loading-state";
import { useSettingsNavigation } from "./navigation.js";

const SettingsContent = lazy(() => import("./content.js"));

export function SettingsOverlay() {
  const { opened, close } = useSettingsNavigation();
  const c = useTranslations("common");
  return (
    <Dialog
      open={opened}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        closeLabel={c("close")}
        className="flex h-[min(48rem,90dvh)] max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(56rem,calc(100%-2rem))]"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-14">
          <DialogTitle>{c("settings")}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Suspense fallback={<LoadingState label={c("loading")} />}>
            <SettingsContent />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
