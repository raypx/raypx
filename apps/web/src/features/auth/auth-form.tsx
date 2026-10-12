import { AuthLink } from "./auth-link";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useHydrated } from "@tanstack/react-router";
import { useTranslations } from "../../i18n/client";
import { Button } from "@voidmix/ui/components/ui/button";
import { FieldError, FieldGroup } from "@voidmix/ui/components/ui/field";
import { signIn, signUp } from "../../lib/auth-client";
import { AuthCard } from "./auth-card";
import { useAuthCapabilities } from "./capabilities";
import { useAuthSubmission } from "./submission";
import { AuthInput } from "./auth-input";
import { PasswordField } from "./password-field";
import { createVerificationCallbackUrl, normalizeAuthRedirect } from "./route-search";

const defaultAuthenticatedRoute = "/chat";

export function AuthForm({
  mode,
  onSuccess,
  redirectTo,
}: {
  mode: "login" | "signup";
  onSuccess?: () => void | Promise<void>;
  redirectTo?: string;
}) {
  const t = useTranslations("auth");
  const hydrated = useHydrated();
  const capabilities = useAuthCapabilities();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const {
    error,
    pending,
    submit: submitRequest,
  } = useAuthSubmission(
    mode === "login" ? t("signInFailed") : t("registrationFailed"),
    mode === "login" ? t("signInFallback") : t("registrationFallback"),
  );
  const next = normalizeAuthRedirect(redirectTo);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await submitRequest(() =>
      mode === "login"
        ? signIn.email({ email, password })
        : signUp.email({
            email,
            password,
            name,
            callbackURL: createVerificationCallbackUrl(window.location.origin, next),
          }),
    );

    if (!succeeded) return;

    if (onSuccess) {
      await onSuccess();
      return;
    }

    if (mode !== "login") {
      await navigate({
        to: "/verify-email",
        ...(next ? { search: { redirect: next } } : {}),
      });
    } else {
      await navigate({ to: next ?? defaultAuthenticatedRoute });
    }
  }

  if (mode !== "login" && !capabilities.registrationAvailable) {
    return (
      <AuthCard
        description={t("registrationUnavailableDescription")}
        footer={
          <AuthLink next={next} to="/login">
            {t("backToSignIn")}
          </AuthLink>
        }
        title={t("registrationUnavailable")}
      >
        <p className="text-sm leading-6 text-muted-foreground">
          {t("registrationUnavailableBody")}
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description={mode === "login" ? t("loginDescription") : t("signupDescription")}
      footer={
        mode === "login" ? (
          capabilities.registrationAvailable ? (
            <span>
              {t("newToVoidmix")}{" "}
              <AuthLink next={next} to="/signup">
                {t("createAccount")}
              </AuthLink>
            </span>
          ) : null
        ) : (
          <span>
            {t("alreadyHaveAccount")}{" "}
            <AuthLink next={next} to="/login">
              {t("signIn")}
            </AuthLink>
          </span>
        )
      }
      title={mode === "login" ? t("welcomeBack") : t("createYourAccount")}
    >
      <form aria-busy={pending} onSubmit={submit}>
        <FieldGroup className="gap-4">
          {mode !== "login" ? (
            <AuthInput
              label={t("name")}
              autoComplete="name"
              disabled={pending || !hydrated}
              id="auth-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          ) : null}
          <AuthInput
            label={t("email")}
            aria-describedby={error ? "auth-error" : undefined}
            autoComplete="email"
            disabled={pending || !hydrated}
            id="auth-email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
          <PasswordField
            action={
              mode === "login" && capabilities.passwordResetRequestAvailable ? (
                <Link
                  className="text-[0.8125rem] text-muted-foreground hover:text-foreground hover:underline"
                  to="/reset-password"
                  {...(next ? { search: { redirect: next } } : {})}
                >
                  {t("forgotPassword")}
                </Link>
              ) : null
            }
            aria-describedby={error ? "auth-error" : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            disabled={pending || !hydrated}
            id="auth-password"
            label={t("password")}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            value={password}
          />
          {error ? <FieldError id="auth-error">{error}</FieldError> : null}
          <Button className="mt-1 w-full" disabled={pending || !hydrated} size="lg" type="submit">
            {pending
              ? mode === "login"
                ? t("signingIn")
                : t("creatingAccount")
              : mode === "login"
                ? t("signIn")
                : t("createAccount")}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
