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
import { useQuickSettingsStore } from "./quick-settings-store";

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
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("localHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col py-2">
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
