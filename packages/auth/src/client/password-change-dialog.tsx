import { useId, useRef, useState, type FormEvent } from "react";
import { LockIcon } from "@raypx/icons/lock";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { CloseIcon } from "@raypx/icons/close";
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
import { usePasswordChange, type AuthActionSuccess, type PasswordChangeClient } from "../hooks";
import { formText } from "./form-text";
import { PasswordField } from "./password-field";
import { useAuthErrorMessage } from "./use-auth-error-message";

const fields = [
  { name: "currentPassword", purpose: "current" },
  { name: "newPassword", purpose: "new" },
  { name: "confirmPassword", purpose: "confirm" },
] as const;

export function PasswordChangeDialog({
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
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
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
          backdropProps={{ forceRender: true }}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
        >
          <DialogHeader className="pr-8">
            <DialogTitle>{t("changePassword")}</DialogTitle>
            <DialogDescription>{t("passwordChangeHint")}</DialogDescription>
          </DialogHeader>
          {changed && (
            <Alert role="status">
              <AlertDescription>{t("passwordChanged")}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {changed ? (
            <DialogFooter>
              <DialogClose render={<Button variant="outline" disabled={auth.busy} />}>
                {c("close")}
              </DialogClose>
              {auth.error?.kind === "completion" && (
                <Button disabled={auth.busy} onClick={() => void auth.retryCompletion()}>
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
                <Field orientation="horizontal" data-disabled={auth.busy}>
                  <Checkbox
                    id={`${id}-revoke`}
                    checked={revokeOthers}
                    onCheckedChange={setRevokeOthers}
                    disabled={auth.busy}
                  />
                  <FieldLabel htmlFor={`${id}-revoke`}>{t("revokeOtherSessions")}</FieldLabel>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" disabled={auth.busy} />}>
                  {c("cancel")}
                </DialogClose>
                <Button type="submit" disabled={auth.busy}>
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
                className="absolute top-2 right-2"
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
