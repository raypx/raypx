import { useRef, useState, type FormEvent } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { PasswordInput } from "@raypx/ui/password-input";
import { useTranslations } from "../../../i18n.js";
import { authClient } from "../client.js";

type Setup = { secret: string; backupCodes: string[] };

const actionLabels = {
  enable: "methods.enableTotp",
  disable: "methods.disableTotp",
  regenerate: "methods.regenerateBackupCodes",
} as const;

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const active = useRef(false);
  const [action, setAction] = useState<"enable" | "disable" | "regenerate">();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [setup, setSetup] = useState<Setup>();
  const [codes, setCodes] = useState<string[]>([]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || !action) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    form.reset();
    active.current = true;
    setPending(true);
    setFailed(false);
    try {
      if (setup) {
        const code = fields.get("code");
        if (typeof code !== "string") return;
        const result = await authClient.twoFactor.verifyTotp({ code });
        if (result.error) throw new Error("Could not verify authenticator");
        setCodes(setup.backupCodes);
        setSetup(undefined);
        setAction(undefined);
        return;
      }
      const password = fields.get("password");
      if (typeof password !== "string") return;
      if (action === "regenerate") {
        const result = await authClient.twoFactor.generateBackupCodes({ password });
        if (result.error || !result.data) throw new Error("Could not generate backup codes");
        setCodes(result.data.backupCodes);
        setAction(undefined);
        return;
      }
      if (action === "disable") {
        const result = await authClient.twoFactor.disable({ password });
        if (result.error) throw new Error("Could not disable two-factor authentication");
        setAction(undefined);
        return;
      }
      const result = await authClient.twoFactor.enable({ password, method: "totp" });
      if (
        result.error ||
        !result.data ||
        !("totpURI" in result.data) ||
        typeof result.data.totpURI !== "string"
      )
        throw new Error("Could not start authenticator setup");
      const secret = new URL(result.data.totpURI).searchParams.get("secret");
      if (!secret) throw new Error("Missing authenticator secret");
      setSetup({ secret, backupCodes: result.data.backupCodes });
    } catch {
      setFailed(true);
    } finally {
      active.current = false;
      setPending(false);
    }
  }
  return (
    <section className="grid gap-3 border-t pt-4">
      <h3 className="text-sm font-semibold">{t("methods.twoFactor")}</h3>
      {codes.length > 0 && (
        <div className="grid gap-2">
          <p role="status">{t("methods.saveBackupCodes")}</p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <Button className="justify-self-start" variant="outline" onClick={() => setCodes([])}>
            {c("close")}
          </Button>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("methods.failed")}
        </p>
      )}
      {!action && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={codes.length > 0}
            onClick={() => setAction(enabled ? "disable" : "enable")}
          >
            {t(enabled ? "methods.disableTotp" : "methods.enableTotp")}
          </Button>
          {enabled && (
            <Button
              variant="outline"
              disabled={codes.length > 0}
              onClick={() => setAction("regenerate")}
            >
              {t("methods.regenerateBackupCodes")}
            </Button>
          )}
        </div>
      )}
      {action && (
        <form onSubmit={(event) => void submit(event)} className="grid gap-3" aria-busy={pending}>
          {action === "regenerate" && <p>{t("methods.regenerateHint")}</p>}
          {setup ? (
            <>
              <p>{t("methods.authenticatorKey")}</p>
              <code className="break-all">{setup.secret}</code>
              <label className="grid gap-2">
                {t("methods.code")}
                <Input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  minLength={6}
                  maxLength={6}
                  required
                  disabled={pending}
                />
              </label>
            </>
          ) : (
            <label className="grid gap-2">
              {t("password")}
              <PasswordInput
                name="password"
                autoComplete="current-password"
                required
                disabled={pending}
                labels={{ show: t("showPassword"), hide: t("hidePassword") }}
              />
            </label>
          )}
          <div className="flex gap-2">
            <Button disabled={pending}>
              {t(setup ? "methods.verifyCode" : actionLabels[action])}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setSetup(undefined);
                setAction(undefined);
                setFailed(false);
              }}
            >
              {c("cancel")}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
