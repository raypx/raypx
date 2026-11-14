import type { ReactNode } from "react";
import { Input } from "heroui-native/input";
import { Label } from "heroui-native/label";
import { TextArea } from "heroui-native/text-area";
import { TextField } from "heroui-native/text-field";
import { Switch } from "heroui-native/switch";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const NativeSafeArea = withUniwind(SafeAreaView);
export function CapabilityLayout({
  children,
  title,
  scroll = true,
}: {
  children: ReactNode;
  title: string;
  scroll?: boolean;
}) {
  const content = (
    <View className="w-full max-w-[800px] flex-1 self-center gap-4 p-4">
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        {title}
      </Text>
      {children}
    </View>
  );
  return (
    <NativeSafeArea className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {scroll ? (
          <ScrollView contentContainerClassName="grow" keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </NativeSafeArea>
  );
}
export function CapabilityField({
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
  maxLength = 200,
}: {
  label: string;
  value: string;
  onChange(this: void, value: string): void;
  multiline?: boolean;
  disabled?: boolean;
  maxLength?: number;
}) {
  const Control = multiline ? TextArea : Input;
  return (
    <TextField isDisabled={disabled} className="gap-2">
      <Label>{label}</Label>
      <Control
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
        className={multiline ? "min-h-40 p-3 text-base" : "p-3 text-base"}
      />
    </TextField>
  );
}
export function CapabilityToggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange(this: void, value: boolean): void;
  disabled?: boolean;
}) {
  return (
    <View className="min-h-12 flex-row items-center justify-between gap-3">
      <Text className="flex-1 text-base text-foreground">{label}</Text>
      <Switch
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        isSelected={value}
        onSelectedChange={onChange}
        isDisabled={disabled}
      >
        <Switch.Thumb />
      </Switch>
    </View>
  );
}
