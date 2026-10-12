import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@raypx/ui/page-header";
import { IconButton } from "@raypx/ui/icon-button";
import { Moon, Sun } from "@phosphor-icons/react";
import { useDesktopTranslations } from "../../i18n/client";
import { useDesktopPreferences } from "../../lib/preferences";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const t = useDesktopTranslations("settings");
  const theme = useDesktopPreferences((state) => state.theme);
  const toggleTheme = useDesktopPreferences((state) => state.toggleTheme);

  return (
    <div className="page settings-page flex flex-col gap-7 w-full max-w-350 m-auto p-8 [&_>_header_h1]:text-[24px] [&_h2]:text-[18px] [&_h2]:font-semibold">
      <PageHeader className="mb-7" title={t("title")} />
      <section className="settings-section max-w-200 [&_h2]:mb-3">
        <h2>{t("theme")}</h2>
        <div className="flex items-center justify-between gap-6 py-5 border-b border-border">
          <strong className="text-sm font-medium">
            {theme === "dark" ? t("darkTheme") : t("lightTheme")}
          </strong>
          <IconButton
            label={theme === "dark" ? t("lightTheme") : t("darkTheme")}
            variant="outline"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </IconButton>
        </div>
      </section>
    </div>
  );
}
