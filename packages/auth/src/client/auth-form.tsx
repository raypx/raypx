import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Mail, CircleCheck } from "lucide-react";
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
  client: AuthActionClient;
  webUrl: string;
  search: string;
  onSignedIn: AuthActionSuccess;
  LinkComponent: ComponentType<AuthFormLinkProps>;
}

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function AuthForm({
  mode,
  client,
  webUrl,
  search,
  onSignedIn,
  LinkComponent,
}: AuthFormProps) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const locale = useLocale();
  const auth = useAuthActions({ client, locale, webUrl });
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
    <section className="auth-layout">
      <div className="auth-aside">
        <div className="auth-symbol">
          <Mail size={32} strokeWidth={1.5} />
        </div>
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </div>
      <div className="auth-panel">
        <LinkComponent to="account" className="back-link">
          <ArrowLeft size={16} />
          {c("account")}
        </LinkComponent>
        <h2>{title}</h2>
        {mode === "forgot-password" && <p className="muted">{t("resetIntro")}</p>}
        {mode === "verify-email" && (
          <p className="muted">{verified ? t("verified") : t("verifyIntro")}</p>
        )}
        {params.has("error") && (
          <p role="alert" className="notice error">
            {t("invalidLink")}
          </p>
        )}
        {message && (
          <p role="status" className="notice">
            <CircleCheck size={18} />
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {!verified && (
          <form onSubmit={submit} className="form-stack">
            {mode === "signup" && (
              <label htmlFor="auth-name">
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
              <label htmlFor="auth-email">
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
              <label htmlFor="auth-password">
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
              <LinkComponent to="forgot-password" className="text-link align-end">
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
          <LinkComponent to="verify-email" className="text-link verification-link">
            {t("resend")}
          </LinkComponent>
        )}
        <div className="auth-switch">
          {mode === "login" ? (
            <>
              {t("noAccount")}{" "}
              <LinkComponent to="signup" className="text-link">
                {t("create")}
              </LinkComponent>
            </>
          ) : (
            <LinkComponent to="login" className="text-link">
              {c("signIn")}
            </LinkComponent>
          )}
        </div>
      </div>
    </section>
  );
}
