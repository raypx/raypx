import { lazy, Suspense } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import { LoadingState } from "@raypx/ui/loading-state";
import { useSettingsNavigation } from "./navigation.ts";

const SettingsContent = lazy(() => import("./content.tsx"));

export function SettingsOverlay() {
  const { opened, close } = useSettingsNavigation();
  const t = useTranslations("settings");
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
        className="flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(56rem,calc(100%-2rem))]"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-14">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("localHint")}</DialogDescription>
        </DialogHeader>
        <div className="@container/settings min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">
          <Suspense fallback={<LoadingState label={c("loading")} />}>
            <SettingsContent />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}
