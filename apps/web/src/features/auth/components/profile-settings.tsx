import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { StatusBadge } from "@raypx/ui/status-badge";
import { SaveIcon } from "@raypx/icons/save";
import { EditIcon } from "@raypx/icons/edit";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { InfoIcon } from "@raypx/icons/info";
import type { authClient } from "../client.js";
import { authPolicy } from "@raypx/auth/policy";

export function ProfileSettings({
  client,
  name,
  onSaved,
}: {
  client: Pick<typeof authClient, "updateUser">;
  name: string;
  onSaved: () => Promise<unknown>;
}) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const s = useTranslations("settings");
  const id = useId();
  const [draft, setDraft] = useState(name);
  const [savedName, setSavedName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<"saved" | "failed" | "refresh" | null>(null);
  const active = useRef(false);
  const dirty = draft.trim() !== savedName;
  async function save(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    if (active.current || !next || next === savedName) return;
    active.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await client.updateUser({
        name: next,
        fetchOptions: { signal: AbortSignal.timeout(15_000) },
      });
      if (response.error) {
        setFeedback("failed");
        return;
      }
      setSavedName(next);
      setDraft(next);
      setFeedback("saved");
      try {
        await onSaved();
      } catch {
        setFeedback("refresh");
      }
    } catch {
      setFeedback("failed");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => void save(event)}
      aria-busy={busy}
      className="flex min-w-0 flex-col gap-5 pt-4"
    >
      <FieldGroup>
        <Field orientation="responsive" data-disabled={busy}>
          <FieldLabel htmlFor={id} className="min-w-0">
            <UserCircleIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            {t("displayName")}
          </FieldLabel>
          <Input
            id={id}
            className="max-w-full @md/field-group:ml-auto @md/field-group:basis-76 @md/field-group:shrink-0"
            autoComplete="name"
            required
            maxLength={authPolicy.nameMaxLength}
            value={draft}
            disabled={busy}
            onChange={(event) => {
              setDraft(event.target.value);
              setFeedback(null);
            }}
          />
        </Field>
      </FieldGroup>
      {feedback === "failed" && (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{c("networkError")}</AlertDescription>
        </Alert>
      )}
      {feedback === "refresh" && (
        <Alert role="status">
          <InfoIcon aria-hidden="true" />
          <AlertDescription>{t("profileRefresh")}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {dirty && (
            <Badge variant="outline">
              <EditIcon aria-hidden="true" data-icon="inline-start" />
              {s("unsavedChanges")}
            </Badge>
          )}
          {feedback === "saved" && (
            <p role="status">
              <StatusBadge label={t("profileSaved")} tone="success" />
            </p>
          )}
        </div>
        <Button
          type="submit"
          variant="outline"
          className="ml-auto"
          disabled={busy || !draft.trim() || !dirty}
        >
          {busy ? (
            <SpinnerIcon
              aria-hidden="true"
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <SaveIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {c(busy ? "working" : "save")}
        </Button>
      </div>
    </form>
  );
}
