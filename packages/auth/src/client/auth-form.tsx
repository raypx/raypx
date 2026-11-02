import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Separator } from "@raypx/ui/components/ui/separator";
import { Input } from "@raypx/ui/components/ui/input";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { useAuthActions, type AuthActionClient, type AuthActionSuccess } from "../hooks";
import { authPolicy } from "../policy";
import { formText } from "./form-text";
import { PasswordField } from "./password-field";
import { useMailCooldown } from "./use-mail-cooldown";
import { useAuthErrorMessage } from "./use-auth-error-message";

const modeLabels = {
  login: { title: "login", submit: "login", success: null },
  signup: { title: "signup", submit: "create", success: "verifyIntro" },
  "forgot-password": { title: "reset", submit: "sendReset", success: "resetSent" },
  "reset-password": { title: "reset", submit: "reset", success: "resetSaved" },
  "verify-email": { title: "verify", submit: "resend", success: "verifySent" },
} as const;

export type AuthMode = "login" | "signup" | "forgot-password" | "reset-password" | "verify-email";

export interface AuthFormLinkProps {
  to: "account" | "login" | "signup" | "forgot-password" | "verify-email";
  className: string;
  children: ReactNode;
}

export interface AuthFormProps {
  mode: AuthMode;
  backLabel?: string | undefined;
  client: AuthActionClient;
  webUrl: string;
  search: string;
  onSignedIn: AuthActionSuccess;
  callbackURLs?: { verify: string; reset: string } | undefined;
  LinkComponent: ComponentType<AuthFormLinkProps>;
}

export function AuthForm({
  mode,
  backLabel,
  client,
  webUrl,
  search,
  onSignedIn,
  callbackURLs,
  LinkComponent,
}: AuthFormProps) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const locale = useLocale();
  const auth = useAuthActions({
    client,
    locale,
    webUrl,
    ...(callbackURLs ? { callbackURLs } : {}),
  });
  const { busy } = auth;
  const error = useAuthErrorMessage(auth.error, "signInCompletionFailed");
  const [succeeded, setSucceeded] = useState(false);
  const signedIn = succeeded && mode === "login";
  const complete = succeeded && (mode === "login" || mode === "reset-password");
  const messageKey = succeeded ? modeLabels[mode].success : null;
  const cooldown = useMailCooldown();
  const mailMode = mode === "forgot-password" || mode === "verify-email";
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";
  const invalidReset =
    mode === "reset-password" &&
    (!token.trim() ||
      params.has("error") ||
      (auth.error?.kind === "auth" && auth.error.key === "invalidLink"));
  const verified =
    mode === "verify-email" && params.get("verified") === "1" && !params.has("error");
  const title = t(modeLabels[mode].title);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || complete || invalidReset || (mailMode && cooldown.isActive())) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = formText(data, "email");
    const password = formText(data, "password");
    setSucceeded(false);
    async function onSuccess() {
      if (mode === "login" || mode === "reset-password") form.reset();
      setSucceeded(true);
      if (mode === "login") await onSignedIn();
    }
    const result =
      mode === "signup"
        ? await auth.signUp({ name: formText(data, "name"), email, password }, onSuccess)
        : mode === "login"
          ? await auth.signIn({ email, password }, onSuccess)
          : mode === "forgot-password"
            ? await auth.requestPasswordReset({ email }, onSuccess)
            : mode === "reset-password"
              ? await auth.resetPassword(
                  {
                    newPassword: password,
                    token,
                  },
                  onSuccess,
                )
              : await auth.sendVerificationEmail({ email }, onSuccess);
    if (result.status !== "success") {
      if (
        mailMode &&
        result.status === "error" &&
        result.error.kind === "auth" &&
        result.error.key === "rateLimited"
      )
        cooldown.start(result.error.retryAfterSeconds);
      return;
    }
    if (mailMode) cooldown.start();
  }
  const linkClassName =
    "rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <section
      aria-labelledby="auth-title"
      className="mx-auto w-full max-w-sm px-6 py-10 sm:px-0 sm:py-14"
    >
      <LinkComponent
        to="account"
        className="mb-10 inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {backLabel ?? c("account")}
      </LinkComponent>
      <header className="mb-8 flex flex-col gap-3">
        <h1 id="auth-title" className="text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        {mode === "login" || mode === "signup" ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(mode === "signup" ? "signupIntro" : "intro")}
          </p>
        ) : null}
        {mode === "forgot-password" && (
          <p className="text-sm leading-relaxed text-muted-foreground">{t("resetIntro")}</p>
        )}
        {mode === "verify-email" && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {verified ? t("verified") : t("verifyIntro")}
          </p>
        )}
      </header>
      <div className="flex flex-col gap-5">
        {(params.has("error") || invalidReset) && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{t("invalidLink")}</AlertDescription>
          </Alert>
        )}
        {messageKey && (
          <Alert role="status">
            <CircleCheck aria-hidden="true" />
            <AlertDescription>{t(messageKey)}</AlertDescription>
          </Alert>
        )}
        {error && !invalidReset && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {signedIn && (auth.error?.kind === "completion" || busy) && (
          <Button disabled={busy} onClick={() => void auth.retryCompletion()}>
            {c(busy ? "working" : "retry")}
          </Button>
        )}
        {invalidReset && (
          <LinkComponent to="forgot-password" className={linkClassName}>
            {t("sendReset")}
          </LinkComponent>
        )}
        {!verified && !complete && !invalidReset && (
          <form onSubmit={submit} aria-busy={busy}>
            <FieldGroup>
              {mode === "signup" && (
                <Field data-disabled={busy}>
                  <FieldLabel htmlFor="auth-name">{t("name")}</FieldLabel>
                  <Input
                    id="auth-name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={authPolicy.nameMaxLength}
                    disabled={busy}
                    className="h-11"
                  />
                </Field>
              )}
              {mode !== "reset-password" && (
                <Field data-disabled={busy}>
                  <FieldLabel htmlFor="auth-email">{t("email")}</FieldLabel>
                  <Input
                    id="auth-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    defaultValue={params.get("email") ?? ""}
                    required
                    disabled={busy}
                    className="h-11"
                  />
                </Field>
              )}
              {(mode === "login" || mode === "signup" || mode === "reset-password") && (
                <PasswordField
                  label={t(mode === "reset-password" ? "newPassword" : "password")}
                  labelAction={
                    mode === "login" ? (
                      <LinkComponent to="forgot-password" className={linkClassName}>
                        {t("forgot")}
                      </LinkComponent>
                    ) : undefined
                  }
                  id="auth-password"
                  purpose={mode === "login" ? "current" : "new"}
                  name="password"
                  required
                  disabled={busy}
                  className="h-11"
                />
              )}
              <Button
                type="submit"
                size="lg"
                className="mt-1 h-11 w-full"
                disabled={busy || (mailMode && cooldown.remaining > 0)}
              >
                {busy ? (
                  <LoaderCircle
                    data-icon="inline-start"
                    className="motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {busy
                  ? c("working")
                  : mailMode && cooldown.remaining > 0
                    ? t("resendIn", { seconds: String(cooldown.remaining) })
                    : mode === "login"
                      ? c("signIn")
                      : t(modeLabels[mode].submit)}
                {!busy && !(mailMode && cooldown.remaining > 0) && (
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                )}
              </Button>
            </FieldGroup>
          </form>
        )}
        <Separator className="my-1" />
        <footer className="flex flex-col items-center gap-4 text-center text-sm">
          {mode === "login" ? (
            <>
              <p className="text-muted-foreground">
                {t("noAccount")}{" "}
                <LinkComponent to="signup" className={linkClassName + " text-foreground"}>
                  {t("create")}
                </LinkComponent>
              </p>
              <LinkComponent to="verify-email" className={linkClassName + " text-muted-foreground"}>
                {t("resend")}
              </LinkComponent>
            </>
          ) : (
            <LinkComponent to="login" className={linkClassName}>
              {c("signIn")}
            </LinkComponent>
          )}
        </footer>
      </div>
    </section>
  );
}
