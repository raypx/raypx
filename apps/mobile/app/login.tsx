import { useRef, useState, type ComponentRef } from "react";
import { Image, Linking, Text, TextInput, View } from "react-native";
import { useAuthActions } from "@raypx/auth/hooks";
import { apiOrigin, authClient } from "../src/auth";
import { actionErrorKey, useCopy } from "../src/locale";
import { Action, Screen } from "../src/ui";

export default function LoginScreen() {
  const { locale, t } = useCopy();
  const { refetch } = authClient.useSession();
  const actions = useAuthActions({ client: authClient, webUrl: apiOrigin, locale });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [linkFailed, setLinkFailed] = useState(false);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !actions.busy;
  const openWeb = async (path: string) => {
    setLinkFailed(false);
    try {
      await Linking.openURL(`${apiOrigin}${path}`);
    } catch {
      setLinkFailed(true);
    }
  };
  const signIn = async () => {
    if (!canSubmit) return;
    await actions.signIn({ email, password }, async () => {
      setPassword("");
      // Explicitly refresh the subscribed session atom before opening protected routes.
      await refetch();
    });
  };
  return (
    <Screen>
      <Image
        source={require("@raypx/ui/logo-mark.webp")}
        accessibilityLabel="Raypx"
        className="size-12"
      />
      <Text accessibilityRole="header" className="text-[28px] font-semibold text-foreground">
        {t("auth.login")}
      </Text>
      <View>
        <Text nativeID="email-label" className="mb-2 text-sm font-medium text-foreground">
          {t("auth.email")}
        </Text>
        <TextInput
          accessibilityLabel={t("auth.email")}
          accessibilityLabelledBy="email-label"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          editable={!actions.busy}
          value={email}
          onChangeText={(value) => {
            actions.clearError();
            setEmail(value);
          }}
          onSubmitEditing={() => passwordInput.current?.focus()}
          className="min-h-12 rounded-[10px] border border-input p-3 text-base text-foreground focus:border-ring"
        />
      </View>
      <View>
        <Text nativeID="password-label" className="mb-2 text-sm font-medium text-foreground">
          {t("auth.password")}
        </Text>
        <TextInput
          ref={passwordInput}
          accessibilityLabel={t("auth.password")}
          accessibilityLabelledBy="password-label"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          editable={!actions.busy}
          value={password}
          onChangeText={(value) => {
            actions.clearError();
            setPassword(value);
          }}
          onSubmitEditing={() => void signIn()}
          className="min-h-12 rounded-[10px] border border-input p-3 text-base text-foreground focus:border-ring"
        />
      </View>
      {actions.error || linkFailed ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-base leading-6 text-foreground"
        >
          {actions.error ? t(actionErrorKey(actions.error)) : t("common.error")}
        </Text>
      ) : null}
      <Action
        label={t("common.signIn")}
        busy={actions.busy}
        disabled={!canSubmit}
        onPress={() => void signIn()}
      />
      <Action
        label={t("auth.forgot")}
        secondary
        disabled={actions.busy}
        onPress={() => void openWeb("/forgot-password")}
      />
      <Action
        label={t("auth.create")}
        secondary
        disabled={actions.busy}
        onPress={() => void openWeb("/signup")}
      />
    </Screen>
  );
}
