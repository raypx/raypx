import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@raypx/ui/components/ui/alert";
import { IconButton } from "@raypx/ui/icon-button";
import { MailIcon } from "@raypx/icons/mail";
import { CloseIcon } from "@raypx/icons/close";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { useTranslations } from "../../../i18n.js";
import { configurationClient, publicConfigurationQuery } from "../../config/client.js";
import { authClient, webUrl } from "../client.js";

export function MailUnavailable({ reset = false }: { reset?: boolean }) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const titleId = useId();
  const session = authClient.useSession();
  const access = useQuery({
    queryKey: ["configuration", "mail-access", session.data?.user.id],
    queryFn: () => configurationClient.access({}),
    enabled: Boolean(session.data && !session.error),
    retry: false,
    gcTime: 0,
  });
  return (
    <section aria-labelledby={titleId} className="mx-auto flex w-full max-w-100 flex-col gap-5">
      <header className="flex flex-col items-center gap-3 text-center">
        <MailIcon aria-hidden="true" className="mb-2 size-9" />
        <h1 id={titleId} className="text-2xl leading-8 font-semibold tracking-tight text-balance">
          {t(reset ? "mailResetTitle" : "mailVerificationTitle")}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {t(reset ? "mailResetAlternative" : "mailVerificationAlternative")}
        </p>
      </header>
      <Link to="/login" className={buttonVariants({ size: "xl", className: "w-full" })}>
        {c("signIn")}
      </Link>
      {access.data?.allowed && (
        <Link
          to="/admin/settings"
          hash="email"
          className={buttonVariants({ variant: "outline", size: "xl", className: "w-full" })}
        >
          {t("mailSettings")}
        </Link>
      )}
    </section>
  );
}

/** Component memory only: a dismissed reminder never changes account admission. */
export function VerificationPrompt() {
  const t = useTranslations("auth");
  const c = useTranslations("common");
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
  function actionLabel() {
    if (state === "sending") return c("working");
    return t("verifyAction");
  }
  return (
    <div data-verification-reminder className="shrink-0 px-4 pt-4 sm:px-6">
      <Alert role="status" className="rounded-xl bg-muted/30 p-4 pr-12">
        <MailIcon aria-hidden="true" />
        <AlertTitle>
          <h2>{t("verify")}</h2>
        </AlertTitle>
        <AlertDescription className="flex min-w-0 flex-col items-start gap-3 leading-6">
          <span>{t("verifyReminder")}</span>
          <Button
            variant="outline"
            className="h-auto min-h-10 max-w-full py-2"
            disabled={state === "sending" || state === "sent"}
            onClick={() => void verify()}
          >
            {state === "sending" && (
              <SpinnerIcon aria-hidden="true" className="motion-safe:animate-spin" />
            )}
            <span className="whitespace-normal text-left">{actionLabel()}</span>
          </Button>
          {state === "sent" && <span>{t("verifySent")}</span>}
          {state === "failed" && (
            <span role="alert" className="text-destructive-text">
              {t("mailRetry")}
            </span>
          )}
        </AlertDescription>
        <IconButton
          label={t("dismissReminder")}
          size="icon-sm"
          className="absolute top-2 right-2"
          onClick={() => setDismissed(true)}
        >
          <CloseIcon aria-hidden="true" />
        </IconButton>
      </Alert>
    </div>
  );
}
