import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@raypx/ui/components/ui/dialog";
import { AppearanceSettings, LanguageSettings } from "@raypx/blocks/settings";
import { AnalyticsSettings } from "@raypx/analytics/client/settings";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { SettingsIcon } from "@raypx/icons/settings";
import { Link } from "@tanstack/react-router";
import { useQuickSettingsStore } from "./quick-settings-store.js";

/**
 * Quick settings modal for common preferences (appearance, language, analytics).
 * State is managed globally via Zustand store.
 * For advanced settings like device connections, users navigate to /settings.
 */
export function QuickSettingsModal() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { open, closeModal } = useQuickSettingsStore();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && closeModal()}>
      <DialogContent
        closeLabel={c("close")}
        className="max-h-[85dvh] w-[calc(100%-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-b border-border p-5 pr-14">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("localHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="@container/settings flex min-w-0 flex-col px-5 pb-5">
          <AppearanceSettings />
          <LanguageSettings />
          <AnalyticsSettings />

          <Button
            variant="outline"
            nativeButton={false}
            className="mt-6 w-full"
            render={<Link to="/settings" onClick={closeModal} />}
          >
            <SettingsIcon data-icon="inline-start" aria-hidden="true" />
            {c("settings")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
