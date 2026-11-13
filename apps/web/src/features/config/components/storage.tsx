import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storageLocationSchema, type StorageSettingsSnapshot } from "@raypx/contracts/api";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { Switch } from "@raypx/ui/components/ui/switch";
import { LoadingState } from "@raypx/ui/loading-state";
import { useTranslations } from "../../../i18n.js";
import { configurationClient, configurationError } from "../client.js";

const defaults = { endpoint: "", bucket: "", region: "auto", enabled: true };
const blankCredentials = { accessKeyId: "", secretAccessKey: "" };
const fields = ["endpoint", "bucket", "region"] as const;

function storageError(error: unknown) {
  const code = (error as { data?: { error?: { code?: unknown } } } | null)?.data?.error?.code;
  if (code === "STORAGE_ENDPOINT_REQUIRES_OPERATOR") return "operatorEndpoint";
  if (code === "INVALID_INPUT") return "invalidInput";
  return configurationError(error);
}

export function StorageSettings({ accountId, active }: { accountId: string; active: boolean }) {
  const t = useTranslations("site.storage");
  const c = useTranslations("common");
  const queryKey = ["configuration", "storage", accountId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => configurationClient.storage({}, { signal }),
    enabled: active,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  if (query.isError)
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive">
          <AlertDescription>{t(storageError(query.error))}</AlertDescription>
        </Alert>
        {configurationError(query.error) !== "forbidden" && (
          <Button variant="outline" onClick={() => void query.refetch()}>
            {c("retry")}
          </Button>
        )}
      </div>
    );
  if (!query.data) return <LoadingState label={t("loading")} />;
  return <StorageForm initial={query.data} queryKey={queryKey} />;
}

function StorageForm({
  initial,
  queryKey,
}: {
  initial: StorageSettingsSnapshot;
  queryKey: string[];
}) {
  const c = useTranslations("common");
  const site = useTranslations("site");
  const t = useTranslations("site.storage");
  const cache = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial.values ?? defaults);
  const [credentials, setCredentials] = useState(blankCredentials);
  const [notice, setNotice] = useState(false);
  const parsed = storageLocationSchema.safeParse({
    endpoint: values.endpoint.trim(),
    bucket: values.bucket.trim(),
    region: values.region.trim(),
  });
  const current = saved.values ?? defaults;
  const changedLocation = fields.some(
    (field) => (parsed.success ? parsed.data[field] : values[field]) !== current[field],
  );
  const hasCredentials = Boolean(credentials.accessKeyId || credentials.secretAccessKey);
  const needsCredentials = !saved.values || changedLocation;
  const validCredentials =
    needsCredentials || hasCredentials
      ? Boolean(credentials.accessKeyId.trim() && credentials.secretAccessKey)
      : true;
  const dirty = changedLocation || values.enabled !== current.enabled || hasCredentials;

  function accept(snapshot: StorageSettingsSnapshot) {
    setSaved(snapshot);
    setValues(snapshot.values ?? defaults);
    setCredentials(blankCredentials);
    cache.setQueryData(queryKey, snapshot);
  }
  const save = useMutation({
    mutationFn: () =>
      configurationClient.updateStorage({
        revision: saved.revision,
        values: { ...(parsed.success ? parsed.data : values), enabled: values.enabled },
        ...(hasCredentials
          ? { credentials: { ...credentials, accessKeyId: credentials.accessKeyId.trim() } }
          : {}),
      }),
    onSuccess: (snapshot) => {
      accept(snapshot);
      setNotice(true);
      void cache.invalidateQueries({ queryKey: ["session-attachment-status"] });
    },
  });
  const conflict = configurationError(save.error) === "conflict";
  const reload = useMutation({
    mutationFn: () => configurationClient.storage({}),
    onSuccess: (snapshot) => {
      accept(snapshot);
      setNotice(false);
      save.reset();
    },
  });
  const busy = save.isPending || reload.isPending;
  const canSave = !busy && dirty && !conflict && parsed.success && validCredentials;
  function edited() {
    setNotice(false);
    if (!conflict) save.reset();
  }
  const status = !saved.values ? "notConfigured" : saved.values.enabled ? "enabled" : "disabled";
  return (
    <form
      aria-busy={busy}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) save.mutate();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{t("title")}</h2>
        <Badge variant={status === "enabled" ? "secondary" : "outline"}>{t(status)}</Badge>
      </div>
      <fieldset disabled={busy} className="min-w-0">
        <FieldGroup className="gap-4">
          <Field orientation="horizontal" className="justify-between border-y border-border py-3">
            <FieldLabel htmlFor="s3-enabled">{t("allowUploads")}</FieldLabel>
            <Switch
              id="s3-enabled"
              checked={values.enabled}
              onCheckedChange={(enabled) => {
                setValues({ ...values, enabled });
                edited();
              }}
            />
          </Field>
          {fields.map((field) => (
            <Field key={field}>
              <FieldLabel htmlFor={`s3-${field}`}>{t(field)}</FieldLabel>
              <Input
                id={`s3-${field}`}
                type={field === "endpoint" ? "url" : "text"}
                autoComplete="off"
                value={values[field]}
                required
                onChange={(event) => {
                  setValues({ ...values, [field]: event.target.value });
                  edited();
                }}
              />
            </Field>
          ))}
          <div className="grid gap-4 @xl/main:grid-cols-2">
            {(["accessKeyId", "secretAccessKey"] as const).map((field) => (
              <Field key={field}>
                <FieldLabel htmlFor={`s3-${field}`}>{t(field)}</FieldLabel>
                <Input
                  id={`s3-${field}`}
                  type="password"
                  autoComplete="new-password"
                  maxLength={512}
                  aria-describedby="s3-credentials-hint"
                  value={credentials[field]}
                  required={needsCredentials || hasCredentials}
                  onChange={(event) => {
                    setCredentials({ ...credentials, [field]: event.target.value });
                    edited();
                  }}
                />
              </Field>
            ))}
          </div>
          <p id="s3-credentials-hint" className="text-xs text-muted-foreground">
            {t(needsCredentials ? "credentialsRequired" : "credentialsOptional")}
          </p>
        </FieldGroup>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={!canSave}>
          {site(save.isPending ? "saving" : "save")}
        </Button>
        <Button
          variant="outline"
          disabled={busy || !dirty}
          onClick={() => {
            setValues(current);
            setCredentials(blankCredentials);
            edited();
          }}
        >
          {c("discard")}
        </Button>
        {notice && (
          <span role="status" className="text-sm">
            {site("saved")}
          </span>
        )}
      </div>
      {(save.isError || reload.isError) && (
        <div className="flex flex-col items-start gap-2">
          <Alert variant="destructive">
            <AlertDescription>{t(storageError(reload.error ?? save.error))}</AlertDescription>
          </Alert>
          {conflict && (
            <Button variant="outline" disabled={busy} onClick={() => reload.mutate()}>
              {t("reload")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
