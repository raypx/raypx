import { Text } from "react-native";
import { useRouter } from "expo-router";
import { Action, Screen } from "../src/ui.js";
import { useCopy } from "../src/locale.js";

export default function NotFoundScreen() {
  const router = useRouter();
  const { t } = useCopy();
  return (
    <Screen>
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        {t("common.pageNotFound")}
      </Text>
      <Action label={t("common.backToWorkspace")} onPress={() => router.replace("/")} />
    </Screen>
  );
}
