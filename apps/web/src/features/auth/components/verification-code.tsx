import { useRef, useState, type FormEvent } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { useLocale } from "@raypx/i18n/browser";
import { useTranslations } from "../../../i18n.js";
import { TurnstileChallenge } from "./turnstile.js";
import { authClient } from "../client.js";

export function VerificationCode({
  email = false,
  disabled = false,
  turnstileSiteKey,
  onSignedIn,
  onCancel,
}: {
  email?: boolean;
  disabled?: boolean;
  turnstileSiteKey?: string;
  onSignedIn: () => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const locale = useLocale();
  const active = useRef(false);
  const [open, setOpen] = useState(!email);
  const [sent, setSent] = useState("");
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [complete, setComplete] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const needsChallenge = !!turnstileSiteKey && email && !sent && !complete;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || disabled || (needsChallenge && !captchaToken)) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    active.current = true;
    setBusy(true);
    setFailed(false);
    try {
      if (complete) {
        await onSignedIn();
        return;
      }
      if (email && !sent) {
        const emailField = fields.get("email");
        if (typeof emailField !== "string") return;
        const address = emailField.trim();
        const result = await authClient.emailOtp
          .sendVerificationOtp({
            email: address,
            type: "sign-in",
            fetchOptions: {
              headers: {
                "Accept-Language": locale,
                ...(captchaToken ? { "X-Captcha-Response": captchaToken } : {}),
              },
            },
          })
          .finally(() => {
            setCaptchaToken("");
            setCaptchaAttempt((value) => value + 1);
          });
        if (result.error) throw new Error("Could not send code");
        setSent(address);
        return;
      }
      const value = fields.get("code");
      if (typeof value !== "string") return;
      const code = value.trim();
      form.reset();
      const result = email
        ? await authClient.signIn.emailOtp({ email: sent, otp: code })
        : backup
          ? await authClient.twoFactor.verifyBackupCode({ code })
          : await authClient.twoFactor.verifyTotp({ code });
      if (result.error) throw new Error("Invalid code");
      setComplete(true);
      await onSignedIn();
    } catch {
      setFailed(true);
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  if (!open)
    return (
      <Button
        type="button"
        variant="outline"
        size="xl"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {t("methods.emailCode")}
      </Button>
    );
  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3" aria-busy={busy}>
      {!email && (
        <h1 id="auth-title" className="text-xl font-semibold">
          {t("methods.twoFactor")}
        </h1>
      )}
      {!complete && email && !sent && (
        <label className="grid gap-2">
          {t("email")}
          <Input name="email" type="email" autoComplete="email" required disabled={busy} />
        </label>
      )}
      {!complete && (!email || sent) && (
        <label className="grid gap-2">
          {t(backup ? "methods.backupCode" : "methods.code")}
          <Input
            key={backup ? "backup" : "code"}
            name="code"
            autoComplete="one-time-code"
            inputMode={backup ? "text" : "numeric"}
            maxLength={backup ? 32 : 6}
            minLength={backup ? 8 : 6}
            required
            disabled={busy}
          />
        </label>
      )}
      {sent && !complete && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("methods.emailSent", { email: sent })}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t(complete ? "signInCompletionFailed" : "methods.failed")}
        </p>
      )}
      {needsChallenge && (
        <TurnstileChallenge
          key={captchaAttempt}
          siteKey={turnstileSiteKey}
          onToken={setCaptchaToken}
        />
      )}
      <Button disabled={busy || disabled || (needsChallenge && !captchaToken)}>
        {complete ? c("retry") : email && !sent ? t("methods.sendCode") : t("methods.verifyCode")}
      </Button>
      {!complete && (
        <div className="flex flex-wrap gap-2">
          {!email && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setBackup(!backup);
                setFailed(false);
              }}
            >
              {t(backup ? "methods.useAuthenticator" : "methods.useBackup")}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (email) {
                setSent("");
                setOpen(false);
                setFailed(false);
                setCaptchaToken("");
              } else onCancel?.();
            }}
          >
            {c("cancel")}
          </Button>
        </div>
      )}
    </form>
  );
}
