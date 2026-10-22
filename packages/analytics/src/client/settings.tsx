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
    <section className="border-b border-border py-7" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-[15px]">
        {t("title")}
      </h2>
      <p className="mt-1.5 max-w-[65ch] text-[13px] text-muted-foreground">{t("hint")}</p>
      <div className="mt-5 space-y-5">
        {(["usage", "errors"] as const).map((key) => (
          <div key={key} className="flex items-start justify-between gap-8">
            <div>
              <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
                {t(key)}
              </label>
              <p
                id={`${id}-${key}-hint`}
                className="mt-1 max-w-[65ch] text-[13px] text-muted-foreground"
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
        <p className="mt-4 text-[13px] text-muted-foreground">{t("unavailable")}</p>
      )}
      {state.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {t("saveError")}
          <Button variant="outline" className="ml-3" disabled={state.pending} onClick={state.retry}>
            {t("retrySave")}
          </Button>
        </p>
      )}
    </section>
  );
}
