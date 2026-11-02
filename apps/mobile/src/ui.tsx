import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

// Third-party components need an explicit className-to-style adapter.
const StyledSafeAreaView = withUniwind(SafeAreaView);

export function Screen({ children }: { children: ReactNode }) {
  return (
    <StyledSafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerClassName="grow justify-center p-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-[420px] self-center gap-5">{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </StyledSafeAreaView>
  );
}

export function Action({
  label,
  onPress,
  busy = false,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      className={`min-h-12 flex-row items-center justify-center gap-2 rounded-[10px] p-3 active:opacity-75 disabled:opacity-50 ${secondary ? "bg-background" : "bg-primary"}`}
    >
      {busy ? (
        <ActivityIndicator
          colorClassName={secondary ? "accent-foreground" : "accent-primary-foreground"}
        />
      ) : null}
      <Text
        className={`shrink text-base font-semibold ${secondary ? "text-foreground" : "text-primary-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
