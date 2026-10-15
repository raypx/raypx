import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, EnvelopeSimple, CheckCircle } from "@phosphor-icons/react";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { formText } from "../form-data";
import { authClient, authErrorKey, webUrl } from "../account";

export type AuthMode = "login" | "signup" | "forgot-password" | "reset-password" | "verify-email";
export function AuthPage({ mode }: { mode: AuthMode }) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const locale = useLocale();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const params = new URLSearchParams(useLocation({ select: (location) => location.searchStr }));
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
    const email = formText(data, "email").trim();
    const password = formText(data, "password");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const fetchOptions = { headers: { "Accept-Language": locale } };
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name: formText(data, "name").trim(),
              email,
              password,
              callbackURL: `${webUrl}/verify-email?verified=1`,
              fetchOptions,
            })
          : mode === "login"
            ? await authClient.signIn.email({ email, password, fetchOptions })
            : mode === "forgot-password"
              ? await authClient.requestPasswordReset({
                  email,
                  redirectTo: `${webUrl}/reset-password`,
                  fetchOptions,
                })
              : mode === "reset-password"
                ? await authClient.resetPassword({
                    newPassword: password,
                    token: params.get("token") ?? "",
                    fetchOptions,
                  })
                : await authClient.sendVerificationEmail({
                    email,
                    callbackURL: `${webUrl}/verify-email?verified=1`,
                    fetchOptions,
                  });
      if (result.error) {
        const key = authErrorKey(result.error.code);
        setError(key === "generic" ? c("error") : t(key));
      } else if (mode === "login") await navigate({ to: "/" });
      else if (mode === "signup") {
        setMessage(t("verifyIntro"));
      } else
        setMessage(
          t(
            mode === "forgot-password"
              ? "resetSent"
              : mode === "reset-password"
                ? "resetSaved"
                : "verifySent",
          ),
        );
    } catch {
      setError(c("networkError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-layout">
      <div className="auth-aside">
        <div className="auth-symbol">
          <EnvelopeSimple size={32} weight="light" />
        </div>
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </div>
      <div className="auth-panel">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} />
          {c("account")}
        </Link>
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
            <CheckCircle size={18} />
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
              <Link to="/forgot-password" className="text-link align-end">
                {t("forgot")}
              </Link>
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
          <Link to="/verify-email" className="text-link verification-link">
            {t("resend")}
          </Link>
        )}
        <div className="auth-switch">
          {mode === "login" ? (
            <>
              {t("noAccount")}{" "}
              <Link to="/signup" className="text-link">
                {t("create")}
              </Link>
            </>
          ) : (
            <Link to="/login" className="text-link">
              {c("signIn")}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
