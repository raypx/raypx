import "../src/global.css";
import { useCSSVariable, useUniwind } from "uniwind";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { authClient } from "../src/auth";
import { sessionAccess } from "../src/session-policy";
import { useCopy } from "../src/locale";
import { Action, Screen } from "../src/ui";

export default function RootLayout() {
  const session = authClient.useSession();
  const [, checkExpiry] = useState(0);
  const expiresAt = session.data?.session.expiresAt.getTime();
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(
      () => checkExpiry((value) => value + 1),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const access = sessionAccess(session);
  const { theme } = useUniwind();
  const background = useCSSVariable("--background");
  const { t } = useCopy();
  return (
    <SafeAreaProvider>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      {access === "pending" || access === "unavailable" ? (
        <Screen>
          {access === "pending" ? (
            <ActivityIndicator
              accessibilityLabel={t("common.loading")}
              colorClassName="accent-foreground"
            />
          ) : (
            <>
              <Text accessibilityRole="alert" className="text-base leading-6 text-foreground">
                {t("common.networkError")}
              </Text>
              <Action label={t("common.retry")} onPress={() => void session.refetch()} />
            </>
          )}
        </Screen>
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: typeof background === "string" ? background : undefined,
            },
          }}
        >
          <Stack.Protected guard={access === "signedIn"}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={access === "signedOut"}>
            <Stack.Screen name="login" />
          </Stack.Protected>
        </Stack>
      )}
    </SafeAreaProvider>
  );
}
