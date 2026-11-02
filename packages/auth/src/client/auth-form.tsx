import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Separator } from "@raypx/ui/components/ui/separator";
import { Input } from "@raypx/ui/components/ui/input";
import { PasswordInput } from "@raypx/ui/password-input";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { useAuthActions, type AuthActionClient, type AuthActionSuccess } from "../hooks";

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

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
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
  const error = !auth.error
    ? ""
    : auth.error.kind !== "auth"
      ? c("networkError")
      : auth.error.key === "generic"
        ? c("error")
        : t(auth.error.key);
  const [message, setMessage] = useState("");
  const params = new URLSearchParams(search);
  const verified = mode === "verify-email" && params.get("verified") === "1";
  const title =
    mode === "signup"
      ? t("signup")
      : mode === "login"
        ? t("login")
        : mode === "verify-email"
          ? t("verify")
          : t("reset");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = formText(data, "email");
    const password = formText(data, "password");
    setMessage("");
    const result =
      mode === "signup"
        ? await auth.signUp({ name: formText(data, "name"), email, password })
        : mode === "login"
          ? await auth.signIn({ email, password }, onSignedIn)
          : mode === "forgot-password"
            ? await auth.requestPasswordReset({ email })
            : mode === "reset-password"
              ? await auth.resetPassword({
                  newPassword: password,
                  token: params.get("token") ?? "",
                })
              : await auth.sendVerificationEmail({ email });
    if (result.status !== "success") return;
    if (mode === "signup") setMessage(t("verifyIntro"));
    else if (mode !== "login")
      setMessage(
        t(
          mode === "forgot-password"
            ? "resetSent"
            : mode === "reset-password"
              ? "resetSaved"
              : "verifySent",
        ),
      );
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
        {params.has("error") && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{t("invalidLink")}</AlertDescription>
          </Alert>
        )}
        {message && (
          <Alert role="status">
            <CircleCheck aria-hidden="true" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!verified && (
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
                    maxLength={120}
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
                <Field data-disabled={busy}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FieldLabel htmlFor="auth-password">
                      {t(mode === "reset-password" ? "newPassword" : "password")}
                    </FieldLabel>
                    {mode === "login" && (
                      <LinkComponent to="forgot-password" className={linkClassName}>
                        {t("forgot")}
                      </LinkComponent>
                    )}
                  </div>
                  <PasswordInput
                    id="auth-password"
                    labels={{ show: c("showPassword"), hide: c("hidePassword") }}
                    name="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    minLength={mode === "login" ? 1 : 8}
                    maxLength={128}
                    required
                    disabled={busy}
                    className="h-11"
                  />
                </Field>
              )}
              <Button
                type="submit"
                size="lg"
                className="mt-1 h-11 w-full"
                disabled={busy || (mode === "reset-password" && !params.get("token"))}
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
                  : mode === "login"
                    ? c("signIn")
                    : mode === "signup"
                      ? t("create")
                      : mode === "forgot-password"
                        ? t("sendReset")
                        : mode === "reset-password"
                          ? t("reset")
                          : t("resend")}
                {!busy && <ArrowRight data-icon="inline-end" aria-hidden="true" />}
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
