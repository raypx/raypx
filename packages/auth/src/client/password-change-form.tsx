import { useId, useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "@raypx/i18n/browser";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { PasswordInput } from "@raypx/ui/password-input";
import { usePasswordChange, type AuthActionSuccess, type PasswordChangeClient } from "../hooks";
import { authPolicy } from "../policy";
import { formText } from "./form-text";

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
  const error = mismatch
    ? t("passwordMismatch")
    : !auth.error
      ? ""
      : auth.error.kind === "completion"
        ? t("passwordChangeRefresh")
        : auth.error.kind === "network"
          ? c("networkError")
          : auth.error.key === "generic"
            ? c("error")
            : t(auth.error.key);
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
            {(["currentPassword", "newPassword", "confirmPassword"] as const).map((name) => {
              const invalid =
                name === "confirmPassword"
                  ? mismatch
                  : name === "currentPassword" &&
                    auth.error?.kind === "auth" &&
                    auth.error.key === "currentPasswordInvalid";
              return (
                <Field key={name} data-disabled={auth.busy} data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor={`${id}-${name}`}>{t(name)}</FieldLabel>
                  <PasswordInput
                    id={`${id}-${name}`}
                    name={name}
                    labels={{ show: c("showPassword"), hide: c("hidePassword") }}
                    autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
                    minLength={name === "currentPassword" ? 1 : authPolicy.passwordMinLength}
                    maxLength={authPolicy.passwordMaxLength}
                    required
                    disabled={auth.busy}
                    aria-invalid={invalid || undefined}
                    onChange={() => {
                      setMismatch(false);
                      auth.clearError();
                    }}
                  />
                </Field>
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
