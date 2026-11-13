import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resendUpdateSchema, type ResendSettingsSnapshot } from "@raypx/contracts/api";
import { LOCALE_OPTIONS } from "@raypx/i18n";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import { Switch } from "@raypx/ui/components/ui/switch";
import { LoadingState } from "@raypx/ui/loading-state";
import { useTranslations } from "../../../i18n.js";
import { configurationClient, configurationError } from "../client.js";
import { ConfigurationActions } from "./actions.js";

const defaults = { from: "", defaultLocale: "en", enabled: true } as const;
const languages = LOCALE_OPTIONS.map(({ value, nativeName }) => ({ value, label: nativeName }));

function resendError(error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "BAD_REQUEST" ? "invalidInput" : configurationError(error);
}

export function ResendSettings({ accountId, active }: { accountId: string; active: boolean }) {
  const t = useTranslations("site.mail");
  const c = useTranslations("common");
  const queryKey = ["configuration", "resend", accountId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => configurationClient.resend({}, { signal }),
    enabled: active,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  if (query.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-4 sm:p-6">
        <Alert variant="destructive">
          <AlertDescription>{t(configurationError(query.error))}</AlertDescription>
        </Alert>
        {configurationError(query.error) !== "forbidden" && (
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {c("retry")}
          </Button>
        )}
      </div>
    );
  if (!query.data)
    return (
      <div className="px-4 sm:px-6">
        <LoadingState label={t("loading")} />
      </div>
    );
  return <ResendForm initial={query.data} queryKey={queryKey} />;
}

function ResendForm({
  initial,
  queryKey,
}: {
  initial: ResendSettingsSnapshot;
  queryKey: string[];
}) {
  const t = useTranslations("site.mail");
  const site = useTranslations("site");
  const cache = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial.values ?? defaults);
  const [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState(false);
  const current = saved.values ?? defaults;
  const replacement = apiKey.trim();
  const dirty =
    values.from !== current.from ||
    values.enabled !== current.enabled ||
    values.defaultLocale !== current.defaultLocale ||
    Boolean(replacement);
  const input = resendUpdateSchema.safeParse({
    values,
    revision: saved.revision,
    ...(replacement ? { apiKey: replacement } : {}),
  });
  function accept(snapshot: ResendSettingsSnapshot) {
    setSaved(snapshot);
    setValues(snapshot.values ?? defaults);
    setApiKey("");
    cache.setQueryData(queryKey, snapshot);
  }
  const save = useMutation({
    mutationFn: () => {
      if (!input.success) throw new Error("Invalid email settings");
      return configurationClient.updateResend(input.data);
    },
    gcTime: 0,
    onSuccess: (snapshot) => {
      accept(snapshot);
      setNotice(true);
      save.reset();
    },
  });
  const conflict = configurationError(save.error) === "conflict";
  const reload = useMutation({
    mutationFn: () => configurationClient.resend({}),
    onSuccess: (next) => {
      setSaved(next);
      setValues((draft) => ({
        from: draft.from !== current.from ? draft.from : (next.values?.from ?? defaults.from),
        enabled:
          draft.enabled !== current.enabled
            ? draft.enabled
            : (next.values?.enabled ?? defaults.enabled),
        defaultLocale:
          draft.defaultLocale !== current.defaultLocale
            ? draft.defaultLocale
            : (next.values?.defaultLocale ?? defaults.defaultLocale),
      }));
      cache.setQueryData(queryKey, next);
      save.reset();
    },
  });
  const busy = save.isPending || reload.isPending;
  const canSave =
    !busy && dirty && !conflict && input.success && Boolean(saved.values || replacement);
  function edited() {
    setNotice(false);
    if (!conflict) save.reset();
  }
  const status = !saved.values ? "notConfigured" : saved.values.enabled ? "enabled" : "disabled";
  return (
    <form
      aria-busy={busy}
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) save.mutate();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-6">
        <h2 className="font-medium">Resend</h2>
        <Badge variant={status === "enabled" ? "secondary" : "outline"}>{t(status)}</Badge>
      </div>
      <fieldset disabled={busy} className="min-w-0 px-4 pt-3 pb-5 sm:px-6">
        <FieldGroup className="gap-4">
          <Field
            orientation="horizontal"
            className="justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5"
          >
            <FieldLabel htmlFor="resend-enabled">{t("allowMail")}</FieldLabel>
            <Switch
              id="resend-enabled"
              checked={values.enabled}
              onCheckedChange={(enabled) => {
                setValues({ ...values, enabled });
                edited();
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="resend-from">{t("from")}</FieldLabel>
            <Input
              id="resend-from"
              autoComplete="off"
              maxLength={320}
              required
              placeholder="Raypx <noreply@example.com>"
              aria-describedby="resend-from-hint"
              value={values.from}
              onChange={(event) => {
                setValues({ ...values, from: event.target.value });
                edited();
              }}
            />
            <p id="resend-from-hint" className="text-xs text-muted-foreground">
              {t("fromHint")}
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="resend-key">{t("apiKey")}</FieldLabel>
            <Input
              id="resend-key"
              type="password"
              autoComplete="new-password"
              maxLength={512}
              required={!saved.values}
              aria-describedby="resend-key-hint"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                edited();
              }}
            />
            <p id="resend-key-hint" className="text-xs text-muted-foreground">
              {t(saved.values ? "keepKey" : "enterKey")}
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="resend-locale">{t("locale")}</FieldLabel>
            <Select
              items={languages}
              disabled={busy}
              value={values.defaultLocale}
              onValueChange={(defaultLocale) => {
                if (defaultLocale !== "en" && defaultLocale !== "zh") return;
                setValues({ ...values, defaultLocale });
                edited();
              }}
            >
              <SelectTrigger id="resend-locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {languages.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </fieldset>
      <ConfigurationActions
        busy={busy}
        saving={save.isPending}
        dirty={dirty}
        saved={notice}
        canSave={canSave}
        onDiscard={() => {
          setValues(current);
          setApiKey("");
          edited();
        }}
      />
      {(save.isError || reload.isError) && (
        <div className="flex flex-col items-start gap-2 border-t border-border px-4 py-4 sm:px-6">
          <Alert variant="destructive">
            <AlertDescription>{t(resendError(reload.error ?? save.error))}</AlertDescription>
          </Alert>
          {conflict && (
            <Button variant="outline" disabled={busy} onClick={() => reload.mutate()}>
              {site("reload")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
