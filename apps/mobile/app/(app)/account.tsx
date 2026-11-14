import { Image, Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuthActions } from "@raypx/auth/hooks";
import { apiOrigin, authClient } from "../../src/auth.js";
import { actionErrorKey, useCopy } from "../../src/locale.js";
import { Action, Screen } from "../../src/ui.js";
import { AccountApprovalSettings } from "../../src/agents/approval-settings.js";
import { useWorkspace } from "../../src/agents/provider.js";
import { clearDestination } from "../../src/destination.js";

export default function AccountScreen() {
  const router = useRouter();
  const workspace = useWorkspace();
  const { data } = authClient.useSession();
  const { locale, t } = useCopy();
  const actions = useAuthActions({ client: authClient, webUrl: apiOrigin, locale });
  return (
    <Screen>
      <Action label={t("agents.back")} secondary onPress={() => router.replace("/")} />
      <Image
        source={require("@raypx/ui/logo-mark.webp")}
        accessibilityLabel="Raypx"
        className="size-12"
      />
      <Text accessibilityRole="header" className="text-[28px] font-semibold text-foreground">
        {t("common.account")}
      </Text>
      <Text className="text-base leading-6 text-foreground">{data?.user.name}</Text>
      <Text className="text-base leading-6 text-muted-foreground">{data?.user.email}</Text>
      {workspace.api?.approvals ? <AccountApprovalSettings port={workspace.api.approvals} /> : null}
      {actions.error ? (
        <Text accessibilityRole="alert" className="text-base leading-6 text-foreground">
          {t(actionErrorKey(actions.error))}
        </Text>
      ) : null}
      <Action
        label={t("common.signOut")}
        busy={actions.busy}
        onPress={() => {
          clearDestination();
          void actions.signOut();
        }}
      />
    </Screen>
  );
}
