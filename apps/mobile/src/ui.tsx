import type { ReactNode } from "react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Spinner } from "heroui-native/spinner";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

// Third-party components need an explicit className-to-style adapter.
const StyledSafeAreaView = withUniwind(SafeAreaView);

export function Screen({
  children,
  centered = false,
}: {
  children: ReactNode;
  centered?: boolean;
}) {
  return (
    <StyledSafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerClassName={centered ? "grow justify-center p-6" : "grow p-4"}
          keyboardShouldPersistTaps="handled"
        >
          <View
            className={
              centered
                ? "w-full max-w-[420px] self-center gap-5"
                : "w-full max-w-[800px] self-center gap-6"
            }
          >
            {children}
          </View>
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
  danger = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  let variant: "primary" | "ghost" | "danger-soft" = "primary";
  if (secondary) variant = "ghost";
  if (danger) variant = "danger-soft";
  let spinnerRole: "danger" | "foreground" | "accent-foreground" = "accent-foreground";
  if (secondary) spinnerRole = "foreground";
  if (danger) spinnerRole = "danger";
  const spinnerColor = useThemeColor(spinnerRole);
  return (
    <Button
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      isDisabled={disabled || busy}
      variant={variant}
      onPress={onPress}
      className={
        danger
          ? "h-auto min-h-12 rounded-lg border border-danger-border bg-danger-bg p-3"
          : "h-auto min-h-12 rounded-lg p-3"
      }
    >
      {busy ? (
        <Spinner
          size="sm"
          color={spinnerColor}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      <Button.Label
        className={danger ? "shrink font-semibold text-danger-text" : "shrink font-semibold"}
      >
        {label}
      </Button.Label>
    </Button>
  );
}
