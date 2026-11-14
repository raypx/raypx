import { useId, useState } from "react";
import { useLocale } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { SpinnerIcon } from "@raypx/icons/spinner";
import { useTranslations } from "../../../i18n.js";
import { configurationClient } from "../client.js";

export function TestEmail({
  disabled,
  disabledReason,
}: {
  disabled: boolean;
  disabledReason?: string | undefined;
}) {
  const t = useTranslations("site.mail");
  const c = useTranslations("common");
  const locale = useLocale();
  const reasonId = useId();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  async function send() {
    if (state === "sending" || disabled) return;
    setState("sending");
    try {
      setState((await configurationClient.testMail({ locale })).sent ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }
  function buttonLabel() {
    if (state === "failed") return c("retry");
    if (state === "sending") return t("testSending");
    return t("sendTest");
  }
  return (
    <section
      aria-label={t("testTitle")}
      className="flex min-w-0 flex-col gap-3 border-t border-border px-4 py-4 sm:px-6"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{t("testTitle")}</h3>
          <p id={reasonId} className="mt-1 text-sm leading-6 text-muted-foreground">
            {disabledReason ?? t("testHint")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-describedby={reasonId}
          disabled={disabled || state === "sending"}
          onClick={() => void send()}
        >
          {state === "sending" && (
            <SpinnerIcon aria-hidden="true" className="motion-safe:animate-spin" />
          )}
          {buttonLabel()}
        </Button>
      </div>
      {(state === "sent" || state === "failed") && (
        <Alert
          role={state === "failed" ? "alert" : "status"}
          variant={state === "failed" ? "destructive" : "default"}
          className="rounded-lg p-3"
        >
          {state === "sent" ? (
            <CheckCircleIcon aria-hidden="true" />
          ) : (
            <AlertCircleIcon aria-hidden="true" />
          )}
          <AlertDescription className="leading-6">
            {t(state === "sent" ? "testSent" : "testFailed")}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
