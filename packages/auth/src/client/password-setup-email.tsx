import { useId, useState } from "react";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { LockIcon } from "@raypx/icons/lock";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import { useAuthActions, type AuthActionClient } from "../hooks.js";
import { useAuthErrorMessage } from "./use-auth-error-message.js";
import { useMailCooldown } from "./use-mail-cooldown.js";

export function PasswordSetupEmail({
  client,
  email,
  webUrl,
}: {
  client: AuthActionClient;
  email: string;
  webUrl: string;
}) {
  const id = useId();
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const auth = useAuthActions({ client, locale: useLocale(), webUrl });
  const cooldown = useMailCooldown();
  const [sent, setSent] = useState(false);
  const error = useAuthErrorMessage(auth.error, "signInCompletionFailed");

  async function sendLink() {
    if (auth.busy || cooldown.isActive()) return;
    setSent(false);
    const result = await auth.requestPasswordReset({ email });
    if (result.status === "success") {
      setSent(true);
      cooldown.start();
    } else if (
      result.status === "error" &&
      result.error.kind === "auth" &&
      result.error.key === "rateLimited"
    ) {
      cooldown.start(result.error.retryAfterSeconds);
    }
  }

  let action = t("sendPasswordSetupLink");
  if (auth.busy) action = c("working");
  else if (cooldown.remaining > 0) action = t("resendIn", { seconds: String(cooldown.remaining) });

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={id} className="flex items-center gap-2 text-sm font-medium">
            <LockIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            {t("setPassword")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("passwordSetupHint")}</p>
        </div>
        <Button
          variant="outline"
          disabled={auth.busy || cooldown.remaining > 0}
          onClick={() => void sendLink()}
        >
          {action}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {sent && (
        <Alert role="status">
          <AlertDescription>{t("passwordSetupLinkSent")}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
