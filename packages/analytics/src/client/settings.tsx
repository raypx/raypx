import { useTranslations } from "./i18n.js";
import { Button } from "@raypx/ui/components/ui/button";
import { useId } from "react";

import { Switch } from "@raypx/ui/components/ui/switch";
import { StatusBadge, type StatusTone } from "@raypx/ui/status-badge";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { useAnalyticsPreferences } from "./provider.js";

type PreferenceState = ReturnType<typeof useAnalyticsPreferences>;
type ConsentKey = "usage" | "errors";
type StatusKey = "loading" | "unconfigured" | "working" | "enabled" | "disabled";

/** Build configuration is known before stored consent loads, so it decides first. */
function consentStatus(state: PreferenceState, key: ConsentKey): StatusKey {
  if (!state.configured) return "unconfigured";
  if (!state.ready) return "loading";
  if (state.pending) return "working";
  return state.consent[key] ? "enabled" : "disabled";
}

const statusTones: Record<StatusKey, StatusTone> = {
  loading: "neutral",
  unconfigured: "neutral",
  working: "info",
  enabled: "success",
  disabled: "neutral",
};

export function AnalyticsSettings() {
  const t = useTranslations("analytics"),
    c = useTranslations("common"),
    id = useId(),
    state = useAnalyticsPreferences();
  return (
    <section
      className="@container/analytics flex flex-col gap-5 py-5"
      aria-labelledby={`${id}-title`}
    >
      <header className="flex flex-col gap-2">
        <h2 id={`${id}-title`} className="text-sm font-medium">
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("hint")}</p>
      </header>
      <div className="flex min-w-0 flex-col gap-4">
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {(["usage", "errors"] as const).map((key) => {
            const status = consentStatus(state, key);
            return (
              <li
                key={key}
                className="flex flex-col gap-3 py-4 @min-sm/analytics:flex-row @min-sm/analytics:items-start @min-sm/analytics:justify-between @min-sm/analytics:gap-6"
              >
                <div className="min-w-0">
                  <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
                    {t(key)}
                  </label>
                  <p
                    id={`${id}-${key}-hint`}
                    className="mt-1 text-xs leading-relaxed text-muted-foreground"
                  >
                    {t(`${key}Hint`)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-3">
                  <StatusBadge
                    label={status === "enabled" || status === "disabled" ? t(status) : c(status)}
                    tone={statusTones[status]}
                  />
                  <Switch
                    id={`${id}-${key}`}
                    aria-describedby={`${id}-${key}-hint`}
                    checked={state.consent[key]}
                    disabled={!state.ready || state.pending || !state.configured}
                    onCheckedChange={(checked) =>
                      state.change({ ...state.consent, [key]: checked })
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
        {!state.configured && (
          <p className="text-xs leading-relaxed text-muted-foreground">{t("unavailable")}</p>
        )}
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              {t("saveError")}
              <Button
                variant="outline"
                className="ml-auto"
                disabled={state.pending}
                onClick={state.retry}
              >
                {t("retrySave")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </section>
  );
}
