import { Text, View, Pressable } from "react-native";
import { Uniwind, useUniwind } from "uniwind";
import { LOCALE_OPTIONS, useTranslations, useLanguagePreference } from "@raypx/i18n/native";
import type { UserTheme } from "@raypx/ui/theme";
import { Heading, Screen } from "../src/components";
import { devicePreferences } from "../src/preferences";

export default function Settings() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { theme, hasAdaptiveThemes } = useUniwind();
  const { preference, setPreference } = useLanguagePreference();
  const selected = hasAdaptiveThemes ? "system" : theme;
  function chooseTheme(value: UserTheme) {
    Uniwind.setTheme(value);
    void devicePreferences.writeTheme(value).catch(() => {});
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
          <Choice
            label={c("system")}
            selected={preference === "system"}
            onPress={() => setPreference("system")}
          />
          {LOCALE_OPTIONS.map(({ value, nativeName }) => (
            <Choice
              key={value}
              label={nativeName}
              selected={preference === value}
              onPress={() => setPreference(value)}
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
