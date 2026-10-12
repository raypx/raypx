import { AuthLink } from "./auth-link";
import { CheckCircle } from "@phosphor-icons/react";
import { Button } from "@voidmix/ui/components/ui/button";
import { FieldError, FieldGroup } from "@voidmix/ui/components/ui/field";
import { useState, type FormEvent } from "react";

import { authClient } from "../../lib/auth-client";
import { AuthCard } from "./auth-card";
import { useAuthCapabilities } from "./capabilities";
import { useTranslations } from "../../i18n/client";

import { useAuthSubmission } from "./submission";
import { AuthInput } from "./auth-input";
import { PasswordField } from "./password-field";
import { createPasswordResetCallbackUrl, normalizeAuthRedirect } from "./route-search";

export function ResetPassword({ token, redirectTo }: { token?: string; redirectTo?: string }) {
  const t = useTranslations("auth");
  const capabilities = useAuthCapabilities();
  const next = normalizeAuthRedirect(redirectTo);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const {
    error,
    pending,
    submit: submitRequest,
  } = useAuthSubmission(t("passwordResetFailed"), t("passwordResetFallback"));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      await submitRequest(() =>
        token
          ? authClient.resetPassword({ newPassword: password, token })
          : authClient.requestPasswordReset({
              email,
              redirectTo: createPasswordResetCallbackUrl(window.location.origin, next),
            }),
      )
    )
      setSent(true);
  }

  if (!token && !capabilities.passwordResetRequestAvailable) {
    return (
      <AuthCard
        description={t("passwordResetUnavailableDescription")}
        footer={
          <AuthLink next={next} to="/login">
            {t("backToSignIn")}
          </AuthLink>
        }
        title={t("passwordResetUnavailable")}
      >
        <p className="text-sm leading-6 text-muted-foreground">
          {t("passwordResetUnavailableBody")}
        </p>
      </AuthCard>
    );
  }

  if (sent) {
    return (
      <AuthCard
        description={token ? t("passwordUpdatedDescription") : t("resetLinkSentDescription")}
        title={token ? t("passwordUpdated") : t("checkEmail")}
      >
        <div className="space-y-5">
          <CheckCircle aria-hidden="true" className="size-9 text-primary" />
          <AuthLink next={next} button>
            {t("backToSignIn")}
          </AuthLink>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description={token ? t("chooseNewPassword") : t("sendResetDescription")}
      footer={
        <AuthLink next={next} to="/login">
          {t("backToSignIn")}
        </AuthLink>
      }
      title={token ? t("setNewPassword") : t("resetYourPassword")}
    >
      <form aria-busy={pending} onSubmit={submit}>
        <FieldGroup className="gap-4">
          {token ? (
            <PasswordField
              aria-describedby={error ? "reset-error" : undefined}
              autoComplete="new-password"
              disabled={pending}
              id="new-password"
              label={t("newPassword")}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              value={password}
            />
          ) : (
            <AuthInput
              label={t("email")}
              aria-describedby={error ? "reset-error" : undefined}
              autoComplete="email"
              disabled={pending}
              id="reset-email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          )}
          {error ? <FieldError id="reset-error">{error}</FieldError> : null}
          <Button className="mt-1 w-full" disabled={pending} size="lg" type="submit">
            {pending
              ? token
                ? t("updatingPassword")
                : t("sendingResetLink")
              : token
                ? t("updatePassword")
                : t("sendResetLink")}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
