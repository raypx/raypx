import { useState } from "react";
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

interface QuickSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Quick settings modal for common preferences (appearance, language, analytics).
 * For advanced settings like device connections, users navigate to /settings.
 */
export function QuickSettingsModal({ open, onOpenChange }: QuickSettingsModalProps) {
  const t = useTranslations("settings");
  const c = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Link to="/settings" onClick={() => onOpenChange(false)}>
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

/**
 * Trigger button for quick settings modal
 */
export function QuickSettingsTrigger() {
  const [open, setOpen] = useState(false);
  const c = useTranslations("common");

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={c("settings")}
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Settings className="size-5" />
      </Button>
      <QuickSettingsModal open={open} onOpenChange={setOpen} />
    </>
  );
}
