import { useEffect, useState } from "react";
import { Text } from "react-native";
import type { ApiClient } from "@raypx/client/api";
import { useAuthActions } from "@raypx/auth/hooks";
import { authClient, apiOrigin } from "./auth.js";
import { Action } from "./ui.js";
import { actionErrorKey, useCopy } from "./locale.js";

export function EmailVerificationReminder({
  api,
  email,
  verified,
}: {
  api: ApiClient | undefined;
  email: string;
  verified: boolean;
}) {
  const { locale, t } = useCopy();
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);
  const actions = useAuthActions({ client: authClient, webUrl: apiOrigin, locale });
  useEffect(() => {
    const controller = new AbortController();
    void api?.configuration.public({}, { signal: controller.signal }).then(
      (value) => {
        if (!controller.signal.aborted) setAvailable(value.mailConfigured);
      },
      () => {},
    );
    return () => controller.abort();
  }, [api]);
  if (!available || verified || dismissed) return null;
  return (
    <>
      <Text className="text-base text-foreground">{t("auth.verifyReminder")}</Text>
      <Action
        label={t(sent ? "auth.verifySent" : "auth.resend")}
        disabled={actions.busy || sent}
        busy={actions.busy}
        onPress={() => {
          void actions.sendVerificationEmail({ email }, () => setSent(true));
        }}
      />
      <Action label={t("auth.dismissReminder")} secondary onPress={() => setDismissed(true)} />
      {actions.error && <Text accessibilityRole="alert">{t(actionErrorKey(actions.error))}</Text>}
    </>
  );
}
