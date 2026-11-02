import { useId, useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "@raypx/i18n/browser";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { usePasswordChange, type AuthActionSuccess, type PasswordChangeClient } from "../hooks";
import { formText } from "./form-text";
import { PasswordField } from "./password-field";
import { useAuthErrorMessage } from "./use-auth-error-message";

const fields = [
  { name: "currentPassword", purpose: "current" },
  { name: "newPassword", purpose: "new" },
  { name: "confirmPassword", purpose: "confirm" },
] as const;

export function PasswordChangeForm({
  client,
  onChanged,
}: {
  client: PasswordChangeClient;
  onChanged?: AuthActionSuccess;
}) {
  const id = useId();
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const auth = usePasswordChange(client);
  const [changed, setChanged] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [revokeOthers, setRevokeOthers] = useState(true);
  const authError = useAuthErrorMessage(auth.error, "passwordChangeRefresh");
  const error = mismatch ? t("passwordMismatch") : authError;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (auth.busy || changed) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = formText(data, "currentPassword");
    const newPassword = formText(data, "newPassword");
    if (newPassword !== formText(data, "confirmPassword")) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    await auth.changePassword(
      { currentPassword, newPassword, revokeOtherSessions: revokeOthers },
      async () => {
        form.reset();
        setChanged(true);
        await onChanged?.();
      },
    );
  }
  return (
    <section aria-labelledby={`${id}-title`} className="mb-7 border-t border-border pt-7">
      <h2 id={`${id}-title`} className="mb-4 text-sm font-medium">
        {t("changePassword")}
      </h2>
      {changed && (
        <Alert role="status" className="mb-4">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{t("passwordChanged")}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {changed ? (
        <Button
          variant="outline"
          disabled={auth.busy}
          onClick={() => {
            if (auth.error?.kind === "completion") void auth.retryCompletion();
            else {
              auth.clearError();
              setChanged(false);
            }
          }}
        >
          {c(auth.busy ? "working" : auth.error?.kind === "completion" ? "retry" : "edit")}
        </Button>
      ) : (
        <form onSubmit={(event) => void submit(event)} aria-busy={auth.busy} className="max-w-sm">
          <FieldGroup>
            {fields.map(({ name, purpose }) => {
              const invalid =
                name === "confirmPassword"
                  ? mismatch
                  : name === "currentPassword" &&
                    auth.error?.kind === "auth" &&
                    auth.error.key === "currentPasswordInvalid";
              return (
                <PasswordField
                  key={name}
                  label={t(name)}
                  id={`${id}-${name}`}
                  name={name}
                  purpose={purpose}
                  required
                  disabled={auth.busy}
                  aria-invalid={invalid || undefined}
                  onChange={() => {
                    setMismatch(false);
                    auth.clearError();
                  }}
                />
              );
            })}
            <Field orientation="horizontal" data-disabled={auth.busy}>
              <Checkbox
                id={`${id}-revoke`}
                checked={revokeOthers}
                onCheckedChange={setRevokeOthers}
                disabled={auth.busy}
              />
              <FieldLabel htmlFor={`${id}-revoke`}>{t("revokeOtherSessions")}</FieldLabel>
            </Field>
            <p className="text-sm text-muted-foreground">{t("passwordChangeHint")}</p>
            <Button type="submit" variant="outline" disabled={auth.busy}>
              {auth.busy ? c("working") : t("changePassword")}
            </Button>
          </FieldGroup>
        </form>
      )}
    </section>
  );
}
