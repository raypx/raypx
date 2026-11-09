import { useId, useMemo, useState } from "react";
import { nextJobRuns } from "@raypx/jobs-model";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { SelectField } from "@raypx/ui/select-field";

const presets = {
  daily: "0 9 * * *",
  weekdays: "0 9 * * 1-5",
  weekly: "0 9 * * 1",
} as const;
type Preset = keyof typeof presets | "custom";

/** Preview the same calendar calculation used by the scheduler; never starts a job. */
export function ScheduleFields({
  cron: initialCron,
  timezone: initialTimezone,
  disabled,
}: {
  cron: string;
  timezone: string;
  disabled: boolean;
}) {
  const t = useTranslations("automations");
  const format = useFormatter();
  const id = useId();
  const [cron, setCron] = useState(initialCron);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [preset, setPreset] = useState<Preset>(
    () =>
      (Object.entries(presets).find(([, value]) => value === initialCron)?.[0] as
        | keyof typeof presets
        | undefined) ?? "custom",
  );
  const zone = timezone.trim();
  const preview = useMemo(() => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions();
    } catch {
      return { invalid: "timezone" as const, runs: [] };
    }
    try {
      return { invalid: null, runs: nextJobRuns({ cron: cron.trim(), timezone: zone }) };
    } catch {
      return { invalid: "cron" as const, runs: [] };
    }
  }, [cron, zone]);
  return (
    <FieldGroup>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={`${id}-preset`}>{t("local.schedulePreset")}</FieldLabel>
        <SelectField<Preset>
          id={`${id}-preset`}
          value={preset}
          disabled={disabled}
          options={(["daily", "weekdays", "weekly", "custom"] as const).map((value) => ({
            value,
            label: t(`local.schedulePresets.${value}`),
          }))}
          onValueChange={(value) => {
            setPreset(value);
            if (value !== "custom") setCron(presets[value]);
          }}
        />
      </Field>
      <FieldGroup className="@md/field-group:flex-row">
        <Field
          className="min-w-0 flex-1"
          data-disabled={disabled}
          data-invalid={preview.invalid === "cron"}
        >
          <FieldLabel htmlFor="job-cron">{t("schedule")}</FieldLabel>
          <Input
            id="job-cron"
            name="cron"
            value={cron}
            onChange={(event) => {
              setCron(event.target.value);
              setPreset("custom");
            }}
            aria-describedby={`${id}-cron-hint${preview.invalid === "cron" ? ` ${id}-cron-error` : ""}`}
            aria-invalid={preview.invalid === "cron"}
            disabled={disabled}
            maxLength={120}
            required
          />
          <p id={`${id}-cron-hint`} className="text-xs/relaxed text-muted-foreground">
            {t("timezoneHint")}
          </p>
          {preview.invalid === "cron" && (
            <p id={`${id}-cron-error`} className="text-sm text-destructive-text">
              {t("local.invalidCron")}
            </p>
          )}
        </Field>
        <Field
          className="min-w-0 flex-1"
          data-disabled={disabled}
          data-invalid={preview.invalid === "timezone"}
        >
          <FieldLabel htmlFor="job-timezone">{t("timezone")}</FieldLabel>
          <Input
            id="job-timezone"
            name="timezone"
            value={timezone}
            onChange={(event) => {
              setTimezone(event.target.value);
            }}
            aria-describedby={preview.invalid === "timezone" ? `${id}-timezone-error` : undefined}
            aria-invalid={preview.invalid === "timezone"}
            disabled={disabled}
            maxLength={100}
            required
          />
          {preview.invalid === "timezone" && (
            <p id={`${id}-timezone-error`} className="text-sm text-destructive-text">
              {t("local.invalidTimezone")}
            </p>
          )}
        </Field>
      </FieldGroup>
      {preview.runs.length > 0 && (
        <section
          aria-label={t("preview")}
          className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-xs text-muted-foreground"
        >
          <h3 className="font-medium text-foreground">{t("preview")}</h3>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 tabular-nums">
            {preview.runs.map((value) => (
              <li key={value}>
                <time dateTime={value}>
                  {format.dateTime(new Date(value), {
                    timeZone: zone,
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </FieldGroup>
  );
}
