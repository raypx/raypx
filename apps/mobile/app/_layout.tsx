import "../global.css";
import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useLocales } from "expo-localization";
import { StatusBar } from "expo-status-bar";
import { Uniwind, useCSSVariable } from "uniwind";
import { LanguageProvider, useTranslations, type LocalePreference } from "@raypx/i18n/native";
import { devicePreferences } from "../src/preferences";

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
    void devicePreferences.read().then((value) => {
      if (!active) return;
      Uniwind.setTheme(value.theme);
      setPreference(value.locale);
      setReady(true);
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
    void devicePreferences.writeLocale(value).catch(() => {});
  }
  if (!ready) return null;
  return (
    <LanguageProvider
      preference={preference}
      systemLocales={locales.map((locale) => locale.languageTag)}
      onPreferenceChange={change}
    >
      <Navigation />
    </LanguageProvider>
  );
}
