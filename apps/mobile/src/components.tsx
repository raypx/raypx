import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="px-6 pt-8 pb-12 gap-7"
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Heading({ title, detail }: { title: string; detail?: string }) {
  return (
    <View className="gap-2">
      <Text
        className="text-3xl font-semibold tracking-tight text-foreground"
        accessibilityRole="header"
      >
        {title}
      </Text>
      {detail && <Text className="text-base leading-6 text-muted-foreground">{detail}</Text>}
    </View>
  );
}
export function Action({
  children,
  onPress,
  disabled,
  busy,
  secondary,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      className={`${secondary ? "bg-muted" : "bg-primary"} rounded-lg min-h-12 px-5 py-3 items-center justify-center flex-row gap-2 ${disabled || busy ? "opacity-50" : "active:opacity-75"}`}
    >
      {busy && <ActivityIndicator color={secondary ? "#737373" : "#a3a3a3"} />}
      <Text
        className={`font-medium text-base ${secondary ? "text-foreground" : "text-primary-foreground"}`}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        className="min-h-12 border border-border rounded-lg px-3 text-base text-foreground bg-background"
        placeholderTextColorClassName="accent-muted-foreground"
        {...props}
      />
    </View>
  );
}
export function Notice({ children, error }: { children: string; error?: boolean }) {
  return (
    <View className="rounded-lg bg-muted px-4 py-3">
      <Text
        accessibilityRole={error ? "alert" : "text"}
        className={
          error ? "text-destructive text-sm leading-6" : "text-foreground text-sm leading-6"
        }
      >
        {children}
      </Text>
    </View>
  );
}
