import { useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import type { authClient } from "../client";
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
  const id = useId();
  const [draft, setDraft] = useState(name);
  const [savedName, setSavedName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<"saved" | "failed" | "refresh" | null>(null);
  const active = useRef(false);
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
      className="rounded-xl border border-border bg-background p-5"
    >
      <Field className="md:flex-row md:items-center md:justify-between md:gap-6">
        <FieldLabel htmlFor={id}>{t("displayName")}</FieldLabel>
        <Input
          id={id}
          className="md:max-w-xs"
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
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <Button
          type="submit"
          variant="outline"
          disabled={busy || !draft.trim() || draft.trim() === savedName}
        >
          {c(busy ? "working" : "save")}
        </Button>
        {feedback === "saved" && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("profileSaved")}
          </p>
        )}
        {feedback === "failed" && (
          <p role="alert" className="text-sm text-destructive-text">
            {c("networkError")}
          </p>
        )}
        {feedback === "refresh" && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("profileRefresh")}
          </p>
        )}
      </div>
    </form>
  );
}
