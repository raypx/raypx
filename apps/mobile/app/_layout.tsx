import "../src/global.css";
import { useCSSVariable, useUniwind, withUniwind } from "uniwind";
import { HeroUINativeProviderRaw } from "heroui-native/provider-raw";
import { Spinner } from "heroui-native/spinner";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { authClient } from "../src/auth.ts";
import { sessionAccess } from "../src/session-policy.ts";
import { useCopy } from "../src/locale.ts";
import { Action, Screen } from "../src/ui.tsx";

const StyledGestureHandlerRootView = withUniwind(GestureHandlerRootView);

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
    <StyledGestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <HeroUINativeProviderRaw>
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          {access === "pending" || access === "unavailable" ? (
            <Screen>
              {access === "pending" ? (
                <Spinner accessibilityLabel={t("common.loading")} className="self-center" />
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
        </HeroUINativeProviderRaw>
      </SafeAreaProvider>
    </StyledGestureHandlerRootView>
  );
}
