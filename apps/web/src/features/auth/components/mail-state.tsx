import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@raypx/ui/components/ui/button";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { useTranslations } from "../../../i18n.js";
import { configurationClient, publicConfigurationQuery } from "../../config/client.js";
import { authClient, webUrl } from "../client.js";

export function MailUnavailable({ reset = false }: { reset?: boolean }) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const session = authClient.useSession();
  const access = useQuery({
    queryKey: ["configuration", "mail-access", session.data?.user.id],
    queryFn: () => configurationClient.access({}),
    retry: false,
    gcTime: 0,
  });
  return (
    <Alert>
      <AlertDescription className="flex flex-col gap-2">
        <span>{t(reset ? "mailResetAlternative" : "mailVerificationAlternative")}</span>
        <Link to="/login" className="underline">
          {c("signIn")}
        </Link>
        {access.data?.allowed && (
          <Link to="/admin/settings" hash="email" className="underline">
            {t("mailSettings")}
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** Component memory only: a dismissed reminder never changes account admission. */
export function VerificationPrompt() {
  const t = useTranslations("auth");
  const session = authClient.useSession();
  const configuration = useQuery(publicConfigurationQuery());
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  if (
    dismissed ||
    !session.data ||
    session.data.user.emailVerified ||
    !configuration.data?.mailConfigured
  )
    return null;
  async function verify() {
    if (state === "sending" || state === "sent" || !session.data) return;
    setState("sending");
    try {
      const result = await authClient.sendVerificationEmail({
        email: session.data.user.email,
        callbackURL: `${webUrl}/verify-email?verified=1`,
      });
      setState(result.error ? "failed" : "sent");
    } catch {
      setState("failed");
    }
  }
  return (
    <Alert>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{t("verifyReminder")}</span>
        <Button
          variant="outline"
          disabled={state === "sending" || state === "sent"}
          onClick={() => void verify()}
        >
          {t(state === "sent" ? "verifySent" : "resend")}
        </Button>
        <Button variant="ghost" onClick={() => setDismissed(true)}>
          {t("dismissReminder")}
        </Button>
        {state === "failed" && <span role="alert">{t("mailRetry")}</span>}
      </AlertDescription>
    </Alert>
  );
}
