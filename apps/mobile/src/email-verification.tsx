import { useEffect, useState } from "react";
import { Text, View } from "react-native";
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
    <View className="gap-3 rounded-xl border border-border bg-muted/20 p-4">
      <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
        {t("auth.verify")}
      </Text>
      <Text className="text-sm leading-6 text-muted-foreground">{t("auth.verifyReminder")}</Text>
      <Action
        label={t(sent ? "auth.verifySent" : "auth.verifyAction")}
        disabled={actions.busy || sent}
        busy={actions.busy}
        onPress={() => {
          void actions.sendVerificationEmail({ email }, () => setSent(true));
        }}
      />
      <Action label={t("auth.dismissReminder")} secondary onPress={() => setDismissed(true)} />
      {actions.error && <Text accessibilityRole="alert">{t(actionErrorKey(actions.error))}</Text>}
    </View>
  );
}
