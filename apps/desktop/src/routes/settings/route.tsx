import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@voidmix/ui/components/ui/button";
import { Field, FieldLabel } from "@voidmix/ui/components/ui/field";
import { Input } from "@voidmix/ui/components/ui/input";
import { Switch } from "@voidmix/ui/components/ui/switch";
import { PageHeader } from "@voidmix/ui/page-header";
import { Badge } from "@voidmix/ui/components/ui/badge";
import { IconButton } from "@voidmix/ui/icon-button";
import { HelpHint } from "@voidmix/ui/help-hint";
import { Moon, Sun } from "@phosphor-icons/react";
import { useDesktopTranslations } from "../../i18n/client";
import { useState } from "react";
import { useDesktopPreferences, type DesktopToggle } from "../../lib/preferences";
import { authorizeProjectFolder, type PiRuntimeStatus } from "../../lib/folder";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const sections = [
  {
    title: "syncBehavior",
    settings: [
      ["startWithSystem", "startWithSystemDescription"],
      ["meteredNetworks", "meteredNetworksDescription"],
      ["automaticDownloads", "automaticDownloadsDescription"],
    ],
  },
  {
    title: "notifications",
    settings: [
      ["transferSummaries", "transferSummariesDescription"],
      ["workspaceChanges", "workspaceChangesDescription"],
    ],
  },
] as const;

function SettingToggle({
  label,
  description,
  preference,
  unavailableId,
}: {
  label: string;
  description: string;
  preference: DesktopToggle;
  unavailableId: string;
}) {
  const enabled = useDesktopPreferences((state) => state[preference]);
  const t = useDesktopTranslations("settings");

  return (
    <div className="setting-row flex items-center justify-between gap-6 py-5 px-0 border-b border-border [&_strong]:text-[14px] [&_strong]:font-medium [&_p]:text-muted-foreground [&_p]:text-[12px] [&_p]:mt-1 [@media(max-width:1120px)]:flex-wrap">
      <div className="flex min-w-0 items-center gap-1">
        <strong>{label}</strong>
        <HelpHint label={t("aboutSetting", { name: label })} description={description} />
      </div>
      <Switch aria-label={label} checked={enabled} disabled aria-describedby={unavailableId} />
    </div>
  );
}

function SettingsPage() {
  const t = useDesktopTranslations("settings");
  const theme = useDesktopPreferences((state) => state.theme);
  const toggleTheme = useDesktopPreferences((state) => state.toggleTheme);
  const [folder, setFolder] = useState("");
  const [binding, setBinding] = useState(false);
  const [failed, setFailed] = useState(false);
  const [folderStatus, setFolderStatus] = useState<PiRuntimeStatus | null>(null);

  return (
    <div className="page settings-page flex flex-col gap-7 w-full max-w-350 m-auto p-8 [&_>_header_h1]:text-[24px] [&_h2]:text-[18px] [&_h2]:font-semibold [&_p]:wrap-anywhere [&_[data-slot=badge]]:text-[12px]">
      <PageHeader className="mb-7" title={t("title")} />
      <section className="settings-section max-w-200 [&_h2]:mb-3">
        <h2>{t("theme")}</h2>
        <div className="settings-list">
          <div className="setting-row flex items-center justify-between gap-6 py-5 px-0 border-b border-border [&_strong]:text-[14px] [&_strong]:font-medium [&_p]:text-muted-foreground [&_p]:text-[12px] [&_p]:mt-1 [@media(max-width:1120px)]:flex-wrap">
            <div>
              <strong>{theme === "dark" ? t("darkTheme") : t("lightTheme")}</strong>
            </div>
            <IconButton
              label={theme === "dark" ? t("lightTheme") : t("darkTheme")}
              variant="outline"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </IconButton>
          </div>
        </div>
      </section>
      <section className="settings-section max-w-200 [&_h2]:mb-3">
        <h2>{t("localProject")}</h2>
        <div className="settings-list">
          <div className="setting-row flex items-center justify-between gap-6 py-5 px-0 border-b border-border [&_strong]:text-[14px] [&_strong]:font-medium [&_p]:text-muted-foreground [&_p]:text-[12px] [&_p]:mt-1 [@media(max-width:1120px)]:flex-wrap">
            <div>
              <div className="flex items-center gap-1">
                <strong>{t("projectFolder")}</strong>
                <HelpHint
                  label={t("aboutSetting", { name: t("projectFolder") })}
                  description={t("projectFolderDescription")}
                />
              </div>
              {folderStatus?.authorizedProject ? <p>{folderStatus.authorizedProject}</p> : null}
            </div>
            <div className="flex gap-2">
              <Field>
                <FieldLabel className="sr-only" htmlFor="project-folder">
                  {t("projectFolder")}
                </FieldLabel>
                <Input
                  id="project-folder"
                  className="h-10 min-w-0"
                  value={folder}
                  onChange={(event) => setFolder(event.target.value)}
                  placeholder={t("projectFolderPlaceholder")}
                />
              </Field>
              <Button
                variant="outline"
                disabled={!folder.trim() || binding}
                onClick={() => {
                  setBinding(true);
                  setFailed(false);
                  void authorizeProjectFolder(folder.trim())
                    .then(setFolderStatus)
                    .catch(() => setFailed(true))
                    .finally(() => setBinding(false));
                }}
              >
                {t("bindFolder")}
              </Button>
            </div>
          </div>
          {failed ? <p role="alert">{t("folderFailed")}</p> : null}
          {folderStatus?.reason ? (
            <p className="text-xs text-muted-foreground">{folderStatus.reason}</p>
          ) : null}
        </div>
      </section>
      {sections.map((section) => (
        <section className="settings-section max-w-200 [&_h2]:mb-3" key={section.title}>
          <div className="flex items-center gap-2">
            <h2 className="mb-0!">{t(section.title)}</h2>
            <Badge variant="outline">{t("unavailable")}</Badge>
            <HelpHint
              label={t("aboutSetting", { name: t(section.title) })}
              description={t("preferenceUnavailable")}
            />
          </div>
          <p id={`${section.title}-unavailable`} className="sr-only">
            {t("preferenceUnavailable")}
          </p>
          <div className="settings-list">
            {section.settings.map(([preference, description]) => (
              <SettingToggle
                key={preference}
                label={t(preference)}
                description={t(description)}
                preference={preference}
                unavailableId={`${section.title}-unavailable`}
              />
            ))}
          </div>
        </section>
      ))}
      <section className="settings-section max-w-200 [&_h2]:mb-3">
        <h2>{t("devices")}</h2>
        <Link
          className="inline-flex min-h-8 items-center rounded-lg border border-border px-3 text-sm text-primary hover:bg-muted"
          to="/devices"
        >
          {t("manageDevices")}
        </Link>
      </section>
    </div>
  );
}
