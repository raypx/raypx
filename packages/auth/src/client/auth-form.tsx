import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CircleCheck } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
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
  const verified = params.get("verified") === "1";
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
  return (
    <section className="mx-auto w-full max-w-sm px-6 pt-10 pb-16">
      <LinkComponent
        to="account"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft size={16} />
        {backLabel ?? c("account")}
      </LinkComponent>
      <h1>{title}</h1>
      {mode === "login" || mode === "signup" ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>
      ) : null}
      {mode === "forgot-password" && (
        <p className="mt-2 text-sm text-muted-foreground">{t("resetIntro")}</p>
      )}
      {mode === "verify-email" && (
        <p className="mt-2 text-sm text-muted-foreground">
          {verified ? t("verified") : t("verifyIntro")}
        </p>
      )}
      {params.has("error") && (
        <p
          role="alert"
          className="mt-6 flex items-center gap-2 rounded-lg bg-destructive/8 px-3.5 py-3 text-sm text-destructive [overflow-wrap:anywhere]"
        >
          {t("invalidLink")}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-6 flex items-center gap-2 rounded-lg bg-muted px-3.5 py-3 text-sm [overflow-wrap:anywhere]"
        >
          <CircleCheck size={18} />
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-6 flex items-center gap-2 rounded-lg bg-destructive/8 px-3.5 py-3 text-sm text-destructive [overflow-wrap:anywhere]"
        >
          {error}
        </p>
      )}
      {!verified && (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          {mode === "signup" && (
            <label htmlFor="auth-name" className="flex flex-col gap-1.5 text-sm font-medium">
              {t("name")}
              <Input
                id="auth-name"
                name="name"
                autoComplete="name"
                required
                maxLength={120}
                disabled={busy}
              />
            </label>
          )}
          {mode !== "reset-password" && (
            <label htmlFor="auth-email" className="flex flex-col gap-1.5 text-sm font-medium">
              {t("email")}
              <Input
                id="auth-email"
                type="email"
                name="email"
                autoComplete="email"
                defaultValue={params.get("email") ?? ""}
                required
                disabled={busy}
              />
            </label>
          )}
          {(mode === "login" || mode === "signup" || mode === "reset-password") && (
            <label htmlFor="auth-password" className="flex flex-col gap-1.5 text-sm font-medium">
              {t(mode === "reset-password" ? "newPassword" : "password")}
              <Input
                id="auth-password"
                type="password"
                name="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "login" ? 1 : 8}
                maxLength={128}
                required
                disabled={busy}
              />
            </label>
          )}
          {mode === "login" && (
            <LinkComponent
              to="forgot-password"
              className="self-end text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-current"
            >
              {t("forgot")}
            </LinkComponent>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={busy || (mode === "reset-password" && !params.get("token"))}
          >
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
            <ArrowRight size={16} />
          </Button>
        </form>
      )}
      {mode === "login" && (
        <LinkComponent
          to="verify-email"
          className="mt-4 inline-block text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-current"
        >
          {t("resend")}
        </LinkComponent>
      )}
      <div className="mt-6 text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            {t("noAccount")}{" "}
            <LinkComponent
              to="signup"
              className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-current"
            >
              {t("create")}
            </LinkComponent>
          </>
        ) : (
          <LinkComponent
            to="login"
            className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-current"
          >
            {c("signIn")}
          </LinkComponent>
        )}
      </div>
    </section>
  );
}
