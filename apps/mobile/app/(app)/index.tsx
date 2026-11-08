import { Image, Text } from "react-native";
import { useAuthActions } from "@raypx/auth/hooks";
import { apiOrigin, authClient } from "../../src/auth.ts";
import { actionErrorKey, useCopy } from "../../src/locale.ts";
import { Action, Screen } from "../../src/ui.tsx";

/** Authenticated account shell; remote task screens will live in this protected group. */
export default function AccountScreen() {
  const { data } = authClient.useSession();
  const { locale, t } = useCopy();
  const actions = useAuthActions({ client: authClient, webUrl: apiOrigin, locale });
  return (
    <Screen>
      <Image
        source={require("@raypx/ui/logo-mark.webp")}
        accessibilityLabel="Raypx"
        className="size-12"
      />
      <Text accessibilityRole="header" className="text-[28px] font-semibold text-foreground">
        {t("auth.accountTitle")}
      </Text>
      <Text className="text-base leading-6 text-foreground">{data?.user.name}</Text>
      <Text className="text-base leading-6 text-muted-foreground">{data?.user.email}</Text>
      {actions.error ? (
        <Text accessibilityRole="alert" className="text-base leading-6 text-foreground">
          {t(actionErrorKey(actions.error))}
        </Text>
      ) : null}
      <Action
        label={t("common.signOut")}
        busy={actions.busy}
        onPress={() => void actions.signOut()}
      />
    </Screen>
  );
}
