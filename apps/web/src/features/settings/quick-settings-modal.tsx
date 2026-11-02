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
import { Settings } from "lucide-react";
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
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("localHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <AppearanceSettings />
          <LanguageSettings />
          <AnalyticsSettings />

          {/* Link to full settings page */}
          <div className="border-t border-border pt-6">
            <Link to="/settings" onClick={closeModal}>
              <Button variant="outline" className="w-full">
                <Settings className="size-4" />
                {c("settings")}
              </Button>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
