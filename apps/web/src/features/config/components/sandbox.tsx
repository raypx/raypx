import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sandboxUpdateSchema, type SandboxSettingsSnapshot } from "@raypx/contracts/api";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
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

function serverLacksE2b(error: unknown) {
  const response = error as { code?: unknown; data?: { issues?: unknown } } | null;
  const issues = response?.data?.issues;
  return (
    response?.code === "BAD_REQUEST" &&
    Array.isArray(issues) &&
    issues.some(
      (issue: { path?: unknown; values?: unknown } | null) =>
        Array.isArray(issue?.path) &&
        issue.path[0] === "values" &&
        issue.path[1] === "provider" &&
        Array.isArray(issue.values) &&
        issue.values.includes("docker") &&
        !issue.values.includes("e2b"),
    )
  );
}

export function SandboxSettings({ accountId, active }: { accountId: string; active: boolean }) {
  const t = useTranslations("site");
  const queryKey = ["configuration", "sandbox", accountId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => configurationClient.sandbox({}, { signal }),
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
            {t("sandbox.retry")}
          </Button>
        )}
      </div>
    );
  if (!query.data) return <LoadingState label={t("loading")} />;
  return <SandboxForm initial={query.data} queryKey={queryKey} />;
}

function SandboxForm({
  initial,
  queryKey,
}: {
  initial: SandboxSettingsSnapshot;
  queryKey: string[];
}) {
  const t = useTranslations("site.sandbox");
  const site = useTranslations("site");
  const cache = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial.values);
  const [credential, setCredential] = useState("");
  const [notice, setNotice] = useState(false);
  const current = saved.values;
  const dirty =
    values.provider !== current.provider ||
    values.url !== current.url ||
    values.screen !== current.screen ||
    Boolean(credential);
  const parsed = sandboxUpdateSchema.safeParse({
    values,
    revision: saved.revision,
    ...(credential ? { credential } : {}),
  });
  const save = useMutation({
    mutationFn: () => {
      if (!parsed.success) throw new Error("INVALID_INPUT");
      return configurationClient.updateSandbox(parsed.data);
    },
    gcTime: 0,
    onSuccess: (snapshot) => {
      setSaved(snapshot);
      setValues(snapshot.values);
      setCredential("");
      setNotice(true);
      cache.setQueryData(queryKey, snapshot);
      save.reset();
    },
  });
  const test = useMutation({ mutationFn: () => configurationClient.testSandbox({}), gcTime: 0 });
  const conflict = configurationError(save.error) === "conflict";
  const reload = useMutation({
    mutationFn: () => configurationClient.sandbox({}),
    onSuccess: (next) => {
      setSaved(next);
      setValues((draft) => {
        if (draft.provider !== current.provider) return draft;
        if (
          next.values.provider !== current.provider &&
          draft.url === current.url &&
          draft.screen === current.screen
        )
          return next.values;
        if (next.values.provider !== current.provider) return draft;
        return {
          provider: draft.provider,
          url: draft.url !== current.url ? draft.url : next.values.url,
          screen: draft.screen !== current.screen ? draft.screen : next.values.screen,
        };
      });
      cache.setQueryData(queryKey, next);
      save.reset();
      test.reset();
    },
  });
  const busy = save.isPending || reload.isPending || test.isPending;
  const canSave =
    !busy &&
    dirty &&
    !conflict &&
    parsed.success &&
    (values.provider === "none" ||
      Boolean(
        credential ||
        (saved.hasCredential &&
          values.url === current.url &&
          (values.provider === "e2b") === (current.provider === "e2b")),
      ));
  function edited() {
    setNotice(false);
    test.reset();
    if (!conflict) save.reset();
  }
  function testHint() {
    if (dirty) return t("saveFirst");
    if (saved.values.provider === "none") return t("not-configured");
    return t(saved.values.provider === "e2b" ? "e2bTestHint" : "testHint");
  }
  const formError = reload.error ?? save.error;
  function errorMessage() {
    if (values.provider === "e2b" && serverLacksE2b(formError)) return t("e2bUpdateApi");
    if ((formError as { code?: string } | null)?.code === "BAD_REQUEST") return t("invalidInput");
    return site(configurationError(formError));
  }
  const providers = [
    { value: "none", label: t("disabled") },
    { value: "docker", label: t("supervisor") },
    { value: "e2b", label: "E2B" },
  ];
  return (
    <form
      className="flex flex-col"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) save.mutate();
      }}
    >
      <h2 className="px-4 pt-4 font-medium sm:px-6">{t("title")}</h2>
      <fieldset disabled={busy} className="min-w-0 px-4 pt-3 pb-5 sm:px-6">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="sandbox-provider">{t("provider")}</FieldLabel>
            <Select
              items={providers}
              value={values.provider}
              disabled={busy}
              onValueChange={(provider) => {
                if (provider !== "none" && provider !== "docker" && provider !== "e2b") return;
                if (provider === "e2b" || values.provider === "e2b") {
                  setValues(
                    current.provider === provider
                      ? current
                      : { provider, url: null, screen: false },
                  );
                  setCredential("");
                } else {
                  setValues({ ...values, provider });
                }
                edited();
              }}
            >
              <SelectTrigger id="sandbox-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {providers.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {values.provider !== "e2b" && (
            <Field>
              <FieldLabel htmlFor="sandbox-url">{t("url")}</FieldLabel>
              <Input
                id="sandbox-url"
                type="url"
                autoComplete="off"
                maxLength={2048}
                required={values.provider === "docker"}
                value={values.url ?? ""}
                aria-describedby="sandbox-url-hint"
                onChange={(event) => {
                  setValues({ ...values, url: event.target.value || null });
                  edited();
                }}
              />
              <p id="sandbox-url-hint" className="text-xs text-muted-foreground">
                {t("urlHint")}
              </p>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="sandbox-credential">
              {t(values.provider === "e2b" ? "e2bKey" : "credential")}
            </FieldLabel>
            <Input
              id="sandbox-credential"
              type="password"
              autoComplete="new-password"
              maxLength={512}
              value={credential}
              aria-describedby="sandbox-credential-hint"
              onChange={(event) => {
                setCredential(event.target.value);
                edited();
              }}
            />
            <p id="sandbox-credential-hint" className="text-xs text-muted-foreground">
              {t(values.provider === "e2b" ? "e2bKeyHint" : "credentialHint")}
            </p>
          </Field>
          {values.provider !== "e2b" && (
            <Field orientation="horizontal" className="justify-between">
              <FieldLabel htmlFor="sandbox-screen">{t("screen")}</FieldLabel>
              <Switch
                id="sandbox-screen"
                checked={values.screen}
                onCheckedChange={(screen) => {
                  setValues({ ...values, screen });
                  edited();
                }}
              />
            </Field>
          )}
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
          setCredential("");
          edited();
        }}
      />
      <div className="flex flex-col items-start gap-2 border-t border-border px-4 py-4 sm:px-6">
        <Button
          type="button"
          variant="outline"
          disabled={busy || dirty || saved.values.provider === "none"}
          onClick={() => test.mutate()}
        >
          {t(test.isPending ? "testing" : "test")}
        </Button>
        <p className="text-xs text-muted-foreground">{testHint()}</p>
        {test.data && (
          <p role="status" className="text-sm">
            {test.data.status === "connected"
              ? t("connected", {
                  runtime: test.data.runtime,
                  mode: t(test.data.untrustedTenants ? "untrusted" : "trusted"),
                  screen: t(test.data.screen ? "screenAvailable" : "screenUnavailable"),
                })
              : t(test.data.status)}
          </p>
        )}
        {test.isError && <p role="alert">{t("unavailable")}</p>}
      </div>
      {(save.isError || reload.isError) && (
        <div className="flex flex-col items-start gap-2 border-t border-border px-4 py-4 sm:px-6">
          <Alert variant="destructive">
            <AlertDescription>{errorMessage()}</AlertDescription>
          </Alert>
          {conflict && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => reload.mutate()}>
              {site("reload")}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
