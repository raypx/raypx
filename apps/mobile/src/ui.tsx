import type { ReactNode } from "react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Spinner } from "heroui-native/spinner";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
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
  const spinnerColor = useThemeColor(secondary ? "foreground" : "accent-foreground");
  return (
    <Button
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      isDisabled={disabled || busy}
      variant={secondary ? "ghost" : "primary"}
      onPress={onPress}
      className="h-auto min-h-12 rounded-lg p-3"
    >
      {busy ? (
        <Spinner
          size="sm"
          color={spinnerColor}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      <Button.Label className="shrink font-semibold">{label}</Button.Label>
    </Button>
  );
}
