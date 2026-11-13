import "../src/global.css";
import { useCSSVariable, useUniwind, withUniwind } from "uniwind";
import { HeroUINativeProviderRaw } from "heroui-native/provider-raw";
import { PortalHost } from "heroui-native/portal";
import { Spinner } from "heroui-native/spinner";
import {
  Stack,
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { authClient } from "../src/auth.js";
import { sessionAccess } from "../src/session-policy.js";
import { useCopy } from "../src/locale.js";
import { Action, Screen } from "../src/ui.js";
import { AgentsProvider } from "../src/agents/provider.js";
import { rememberDestination, takeDestination } from "../src/destination.js";
import { sessionExpired, subscribeSession } from "../src/session-events.js";

const StyledGestureHandlerRootView = withUniwind(GestureHandlerRootView);

export default function RootLayout() {
  const session = authClient.useSession();
  const forcedExpiry = useSyncExternalStore(subscribeSession, sessionExpired, sessionExpired);
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const [previousAccount, setPreviousAccount] = useState<string | null>(null);
  const wasSignedIn = useRef(false);
  const [, checkExpiry] = useState(0);
  const expiresAt = session.data ? new Date(session.data.session.expiresAt).getTime() : undefined;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(
      () => checkExpiry((value) => value + 1),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const access = forcedExpiry ? "signedOut" : sessionAccess(session);
  // Retain the pure projection during session revalidation while protected routes are hidden.
  const sessionAccountId = session.data?.user.id;
  let accountId = previousAccount;
  if (access === "signedIn" && session.data) accountId = session.data.user.id;
  if (access === "signedOut") accountId = null;
  useEffect(() => {
    if (access === "signedIn" && sessionAccountId) {
      const currentAccount = sessionAccountId;
      queueMicrotask(() => setPreviousAccount(currentAccount));
      wasSignedIn.current = true;
      rememberDestination(pathname, params, currentAccount);
    } else if (access === "signedOut") {
      if (!wasSignedIn.current) rememberDestination(pathname, params);
      queueMicrotask(() => setPreviousAccount(null));
      wasSignedIn.current = false;
    }
  }, [access, sessionAccountId, pathname, params]);
  const { theme } = useUniwind();
  const background = useCSSVariable("--background");
  const { t } = useCopy();
  return (
    <StyledGestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <HeroUINativeProviderRaw>
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          <AgentsProvider accountId={accountId} enabled={access === "signedIn"}>
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
              <>
                <RestoreDestination signedIn={access === "signedIn"} accountId={accountId} />
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
              </>
            )}
          </AgentsProvider>
          <PortalHost />
        </HeroUINativeProviderRaw>
      </SafeAreaProvider>
    </StyledGestureHandlerRootView>
  );
}

/** Mounted only with the navigator, after the effect-owned workspace is ready. */
function RestoreDestination({
  signedIn,
  accountId,
}: {
  signedIn: boolean;
  accountId: string | null;
}) {
  const router = useRouter();
  const navigation = useRootNavigationState();
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn || !accountId) {
      restored.current = null;
      return;
    }
    if (!navigation?.key) return;
    if (restored.current === accountId) return;
    restored.current = accountId;
    const destination = takeDestination(accountId);
    if (destination) router.replace(destination);
  }, [signedIn, accountId, navigation?.key, router]);
  return null;
}
