import { useState } from "react";
import { useLocale } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { useTranslations } from "../../../i18n.js";
import { configurationClient } from "../client.js";

export function TestEmail({ disabled }: { disabled: boolean }) {
  const t = useTranslations("site.mail");
  const locale = useLocale();
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
  const labels = {
    idle: "testHint",
    sending: "testSending",
    sent: "testSent",
    failed: "testFailed",
  } as const;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t px-4 py-4 sm:px-6">
      <Button
        type="button"
        variant="outline"
        disabled={disabled || state === "sending"}
        onClick={() => void send()}
      >
        {t("sendTest")}
      </Button>
      <p role="status" className="text-sm text-muted-foreground">
        {t(labels[state])}
      </p>
    </div>
  );
}
