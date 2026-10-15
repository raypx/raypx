import { Text, View, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Uniwind, useUniwind } from "uniwind";
import { useTranslations, useLanguagePreference } from "@raypx/i18n/native";
import type { LocalePreference } from "@raypx/i18n/preferences";
import { THEME_STORAGE_KEY, type UserTheme } from "@raypx/ui/theme";
import { Heading, Screen } from "../src/components";

export default function Settings() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { theme, hasAdaptiveThemes } = useUniwind();
  const { preference, setPreference } = useLanguagePreference();
  const selected = hasAdaptiveThemes ? "system" : theme;
  function chooseTheme(value: UserTheme) {
    Uniwind.setTheme(value);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, value).catch(() => {});
  }
  return (
    <Screen>
      <Heading title={t("title")} detail={t("intro")} />
      <View className="gap-5 border-b border-border pb-7">
        <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
          {t("appearance")}
        </Text>
        <Text className="text-sm text-muted-foreground">{t("appearanceHint")}</Text>
        <View className="gap-2">
          {(["light", "dark", "system"] as const).map((value) => (
            <Choice
              key={value}
              label={c(value)}
              selected={selected === value}
              onPress={() => chooseTheme(value)}
            />
          ))}
        </View>
      </View>
      <View className="gap-5 border-b border-border pb-7">
        <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
          {t("language")}
        </Text>
        <Text className="text-sm text-muted-foreground">{t("languageHint")}</Text>
        <View className="gap-2">
          {(
            [
              ["system", c("system")],
              ["en", "English"],
              ["zh", "简体中文"],
            ] as const
          ).map(([value, label]) => (
            <Choice
              key={value}
              label={label}
              selected={preference === value}
              onPress={() => setPreference(value as LocalePreference)}
            />
          ))}
        </View>
      </View>
      <Text className="text-sm leading-6 text-muted-foreground">{t("localHint")}</Text>
    </Screen>
  );
}
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`rounded-lg px-4 py-4 flex-row items-center justify-between border ${selected ? "border-foreground bg-muted" : "border-border bg-background"}`}
    >
      <Text className="text-base text-foreground">{label}</Text>
      <View
        className={`size-4 rounded-full border ${selected ? "border-foreground bg-foreground" : "border-border"}`}
      />
    </Pressable>
  );
}
