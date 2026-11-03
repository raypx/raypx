import { Button } from "@raypx/ui/components/ui/button";
import { useId } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { Switch } from "@raypx/ui/components/ui/switch";
import { useAnalyticsPreferences } from "./provider.js";
export function AnalyticsSettings() {
  const t = useTranslations("analytics"),
    id = useId(),
    state = useAnalyticsPreferences();
  return (
    <section
      className="@container/analytics border-b border-border py-5"
      aria-labelledby={`${id}-title`}
    >
      <div className="grid grid-cols-1 gap-3 @min-xl/analytics:grid-cols-[9rem_minmax(0,1fr)] @min-xl/analytics:gap-6">
        <h2 id={`${id}-title`} className="text-sm font-medium">
          {t("title")}
        </h2>
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-xs leading-relaxed text-muted-foreground">{t("hint")}</p>
          <div className="flex flex-col gap-4">
            {(["usage", "errors"] as const).map((key) => (
              <div key={key} className="flex items-start justify-between gap-4">
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
                <Switch
                  id={`${id}-${key}`}
                  aria-describedby={`${id}-${key}-hint`}
                  checked={state.consent[key]}
                  disabled={!state.ready || state.pending || !state.configured}
                  onCheckedChange={(checked) => state.change({ ...state.consent, [key]: checked })}
                />
              </div>
            ))}
          </div>
          {!state.configured && (
            <p className="text-xs leading-relaxed text-muted-foreground">{t("unavailable")}</p>
          )}
          {state.error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {t("saveError")}
              <Button
                variant="outline"
                className="ml-3"
                disabled={state.pending}
                onClick={state.retry}
              >
                {t("retrySave")}
              </Button>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
