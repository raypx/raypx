import { useTranslations } from "../../i18n.js";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@raypx/ui/components/ui/dialog";
import { AppearanceSettings, LanguageSettings, SettingsSection } from "@raypx/blocks/settings";
import { AnalyticsSettings } from "@raypx/analytics/client/settings";

import { Button } from "@raypx/ui/components/ui/button";
import { DevicesIcon } from "@raypx/icons/devices";
import { SettingsIcon } from "@raypx/icons/settings";
import { Link } from "@tanstack/react-router";
import { useQuickSettingsStore } from "./quick-settings-store.js";

type InstallPromptEvent = Event & { prompt(): Promise<unknown> };

/**
 * Quick settings modal for common preferences (appearance, language, analytics).
 * State is managed globally via Zustand store.
 * For advanced settings like device connections, users navigate to /settings.
 */
export function QuickSettingsModal() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const pwa = useTranslations("guest");
  const { open, closeModal } = useQuickSettingsStore();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    function onInstallPrompt(event: Event) {
      setInstallPrompt(event as InstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }
    if (window.matchMedia("(display-mode: standalone)").matches) onInstalled();
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt || installing) return;
    setInstalling(true);
    try {
      await installPrompt.prompt();
    } catch {
      // The browser menu remains available if this prompt expires or fails.
    } finally {
      setInstallPrompt((current) => (current === installPrompt ? null : current));
      setInstalling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && closeModal()}>
      <DialogContent
        closeLabel={c("close")}
        className="max-h-[85dvh] w-[calc(100%-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-b border-border p-5 pr-14">
          <DialogTitle>{c("settings")}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("localHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="@container/settings flex min-w-0 flex-col px-5 pb-5">
          <AppearanceSettings />
          <LanguageSettings />
          <SettingsSection title={pwa("webApp")} icon={DevicesIcon}>
            <div aria-live="polite">
              {installPrompt && !installed ? (
                <Button variant="outline" disabled={installing} onClick={() => void install()}>
                  {installing ? pwa("installInProgress") : pwa("installApp")}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground @min-xl/settings:text-end">
                  {installed ? pwa("appInstalled") : pwa("installFromMenu")}
                </p>
              )}
            </div>
          </SettingsSection>
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
