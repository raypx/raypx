import "../global.css";
import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useLocales } from "expo-localization";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Uniwind, useCSSVariable } from "uniwind";
import {
  LanguageProvider,
  LOCALE_PREFERENCE_KEY,
  parseLocalePreference,
  useTranslations,
  type LocalePreference,
} from "@raypx/i18n/native";
import { parseTheme, THEME_STORAGE_KEY } from "@raypx/ui/theme";

void SplashScreen.preventAutoHideAsync().catch(() => {});
function Navigation() {
  const c = useTranslations("common");
  const background = useCSSVariable("--color-background") as string;
  const foreground = useCSSVariable("--color-foreground") as string;
  const border = useCSSVariable("--color-border") as string;
  const muted = useCSSVariable("--color-muted-foreground") as string;
  return (
    <>
      <StatusBar style="auto" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: foreground,
          tabBarInactiveTintColor: muted,
          tabBarStyle: { backgroundColor: background, borderTopColor: border },
          tabBarIconStyle: { display: "none" },
          tabBarLabelStyle: { fontSize: 13 },
          tabBarItemStyle: { paddingVertical: 12 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: c("account") }} />
        <Tabs.Screen name="settings" options={{ title: c("settings") }} />
      </Tabs>
    </>
  );
}
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [preference, setPreference] = useState<LocalePreference>("system");
  const locales = useLocales();
  useEffect(() => {
    let active = true;
    void AsyncStorage.multiGet([THEME_STORAGE_KEY, LOCALE_PREFERENCE_KEY])
      .then((values) => {
        if (!active) return;
        Uniwind.setTheme(parseTheme(values[0]?.[1], "system"));
        setPreference(parseLocalePreference(values[1]?.[1]));
      })
      .catch(() => {
        Uniwind.setTheme("system");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  function change(value: LocalePreference) {
    setPreference(value);
    void AsyncStorage.setItem(LOCALE_PREFERENCE_KEY, value).catch(() => {});
  }
  if (!ready) return null;
  return (
    <LanguageProvider
      preference={preference}
      systemLocale={locales[0]?.languageTag ?? "en"}
      onPreferenceChange={change}
    >
      <Navigation />
    </LanguageProvider>
  );
}
