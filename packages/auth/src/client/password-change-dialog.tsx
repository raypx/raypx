import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { LockIcon } from "@raypx/icons/lock";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { CloseIcon } from "@raypx/icons/close";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { useTranslations } from "@raypx/i18n/browser";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@raypx/ui/components/ui/dialog";
import { IconButton } from "@raypx/ui/icon-button";
import { usePasswordChange, type AuthActionSuccess, type PasswordChangeClient } from "../hooks.js";
import { formText } from "./form-text.js";
import { PasswordField } from "./password-field.js";
import { useAuthErrorMessage } from "./use-auth-error-message.js";

const fields = [
  { name: "currentPassword", purpose: "current" },
  { name: "newPassword", purpose: "new" },
  { name: "confirmPassword", purpose: "confirm" },
] as const;

export function PasswordChangeDialog({
  client,
  onChanged,
  recoveryLink,
}: {
  client: PasswordChangeClient;
  onChanged?: AuthActionSuccess;
  recoveryLink?: ReactNode;
}) {
  const id = useId();
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const auth = usePasswordChange(client);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const currentPasswordInput = useRef<HTMLInputElement>(null);
  const [changed, setChanged] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [revokeOthers, setRevokeOthers] = useState(true);
  const authError = useAuthErrorMessage(auth.error, "passwordChangeRefresh");
  const error = mismatch ? t("passwordMismatch") : authError;
  function isFieldInvalid(name: (typeof fields)[number]["name"]) {
    if (name === "confirmPassword") return mismatch;
    return (
      name === "currentPassword" &&
      auth.error?.kind === "auth" &&
      auth.error.key === "currentPasswordInvalid"
    );
  }

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
    <section aria-labelledby={`${id}-title`}>
      <Dialog
        open={open}
        onOpenChange={(next, details) => {
          if (auth.busy) {
            details.cancel();
            return;
          }
          if (!next) {
            formRef.current?.reset();
            setChanged(false);
            setMismatch(false);
            setRevokeOthers(true);
            auth.clearError();
          }
          setOpen(next);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id={`${id}-title`} className="flex items-center gap-2 text-sm font-medium">
            <LockIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            {t("password")}
          </h2>
          <DialogTrigger render={<Button variant="outline" className="ml-auto" />}>
            {t("changePassword")}
          </DialogTrigger>
        </div>
        <DialogContent
          showCloseButton={false}
          initialFocus={currentPasswordInput}
          backdropProps={{ forceRender: true }}
          className="gap-6 rounded-2xl p-6 sm:max-w-md"
        >
          <DialogHeader className="pr-8">
            <DialogTitle className="text-xl leading-7 font-semibold tracking-tight">
              {t(changed ? "resetCompleteTitle" : "changePassword")}
            </DialogTitle>
            <DialogDescription className="leading-6">{t("passwordChangeHint")}</DialogDescription>
          </DialogHeader>
          {changed && (
            <Alert role="status">
              <CheckCircleIcon aria-hidden="true" />
              <AlertDescription>{t("passwordChanged")}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {changed ? (
            <DialogFooter className="-mx-6 -mb-6 rounded-b-2xl p-6 pt-4">
              <DialogClose render={<Button size="xl" variant="outline" disabled={auth.busy} />}>
                {c("close")}
              </DialogClose>
              {auth.error?.kind === "completion" && (
                <Button size="xl" disabled={auth.busy} onClick={() => void auth.retryCompletion()}>
                  {c(auth.busy ? "working" : "retry")}
                </Button>
              )}
            </DialogFooter>
          ) : (
            <form
              ref={formRef}
              onSubmit={(event) => void submit(event)}
              aria-busy={auth.busy}
              className="flex flex-col gap-5"
            >
              <FieldGroup>
                {fields.map(({ name, purpose }) => {
                  const invalid = isFieldInvalid(name);
                  return (
                    <PasswordField
                      key={name}
                      ref={purpose === "current" ? currentPasswordInput : undefined}
                      label={t(name)}
                      labelAction={purpose === "current" && !auth.busy ? recoveryLink : undefined}
                      id={`${id}-${name}`}
                      name={name}
                      purpose={purpose}
                      controlSize="xl"
                      showRequirementsIcon={false}
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
                <Field orientation="horizontal" className="items-start" data-disabled={auth.busy}>
                  <Checkbox
                    id={`${id}-revoke`}
                    checked={revokeOthers}
                    onCheckedChange={setRevokeOthers}
                    disabled={auth.busy}
                    className="mt-0.5"
                  />
                  <FieldLabel htmlFor={`${id}-revoke`}>{t("sessions.revokeOthers")}</FieldLabel>
                </Field>
              </FieldGroup>
              <DialogFooter className="-mx-6 -mb-6 rounded-b-2xl p-6 pt-4">
                <DialogClose render={<Button size="xl" variant="outline" disabled={auth.busy} />}>
                  {c("cancel")}
                </DialogClose>
                <Button type="submit" size="xl" disabled={auth.busy}>
                  {auth.busy && (
                    <SpinnerIcon
                      aria-hidden="true"
                      data-icon="inline-start"
                      className="animate-spin motion-reduce:animate-none"
                    />
                  )}
                  {auth.busy ? c("working") : t("changePassword")}
                </Button>
              </DialogFooter>
            </form>
          )}
          <DialogClose
            render={
              <IconButton
                label={c("close")}
                size="icon-sm"
                className="absolute top-4 right-4"
                disabled={auth.busy}
              />
            }
          >
            <CloseIcon aria-hidden="true" />
          </DialogClose>
        </DialogContent>
      </Dialog>
    </section>
  );
}
