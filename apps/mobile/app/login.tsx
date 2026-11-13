import { useRef, useState } from "react";
import { Input, type InputRef } from "heroui-native/input";
import { Label } from "heroui-native/label";
import { TextField } from "heroui-native/text-field";
import { Image, Linking, Text } from "react-native";
import { useAuthActions } from "@raypx/auth/hooks";
import { apiOrigin, authClient } from "../src/auth.js";
import { actionErrorKey, useCopy } from "../src/locale.js";
import { Action, Screen } from "../src/ui.js";

export default function LoginScreen() {
  const { locale, t } = useCopy();
  const { refetch } = authClient.useSession();
  const [challenge, setChallenge] = useState<"totp" | "backup">();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const verification = useRef(false);
  const actions = useAuthActions({
    client: authClient,
    webUrl: apiOrigin,
    locale,
    onTwoFactorRequired: () => {
      setPassword("");
      setChallenge("totp");
    },
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [linkFailed, setLinkFailed] = useState(false);
  const emailInput = useRef<InputRef>(null);
  const passwordInput = useRef<InputRef>(null);
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
  async function verifyCode() {
    if (verification.current || !code.trim()) return;
    verification.current = true;
    setVerifying(true);
    setCodeError(false);
    try {
      const input = { code: code.trim() };
      const result =
        challenge === "backup"
          ? await authClient.twoFactor.verifyBackupCode(input)
          : await authClient.twoFactor.verifyTotp(input);
      if (result.error) throw new Error("Invalid code");
      await refetch();
    } catch {
      setCodeError(true);
    } finally {
      verification.current = false;
      setCode("");
      setVerifying(false);
    }
  }
  if (challenge) {
    const label = t(challenge === "backup" ? "auth.methods.backupCode" : "auth.methods.code");
    return (
      <Screen>
        <Text accessibilityRole="header" className="text-[28px] font-semibold text-foreground">
          {t("auth.methods.twoFactor")}
        </Text>
        <TextField isDisabled={verifying} className="gap-2">
          <Label>{label}</Label>
          <Input
            accessibilityLabel={label}
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={challenge === "backup" ? "default" : "number-pad"}
            value={code}
            onChangeText={(value) => {
              setCodeError(false);
              setCode(value);
            }}
            onSubmitEditing={() => void verifyCode()}
            className="p-3 text-base"
          />
        </TextField>
        {codeError && <Text accessibilityRole="alert">{t("auth.methods.failed")}</Text>}
        <Action
          label={t("auth.methods.verifyCode")}
          busy={verifying}
          disabled={!code.trim() || verifying}
          onPress={() => void verifyCode()}
        />
        <Action
          label={t(
            challenge === "backup" ? "auth.methods.useAuthenticator" : "auth.methods.useBackup",
          )}
          secondary
          disabled={verifying}
          onPress={() => {
            setCode("");
            setCodeError(false);
            setChallenge(challenge === "backup" ? "totp" : "backup");
          }}
        />
        <Action
          label={t("common.cancel")}
          secondary
          disabled={verifying}
          onPress={() => {
            actions.clearError();
            setCode("");
            setCodeError(false);
            setChallenge(undefined);
          }}
        />
      </Screen>
    );
  }
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
      <TextField isDisabled={actions.busy} className="gap-2">
        <Label accessible={false} onPress={() => emailInput.current?.focus()}>
          <Label.Text nativeID="email-label" className="text-sm">
            {t("auth.email")}
          </Label.Text>
        </Label>
        <Input
          ref={emailInput}
          accessibilityLabel={t("auth.email")}
          accessibilityLabelledBy="email-label"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          value={email}
          onChangeText={(value) => {
            actions.clearError();
            setEmail(value);
          }}
          onSubmitEditing={() => passwordInput.current?.focus()}
          className="p-3 text-base ios:focus:outline-focus android:border-input android:focus:border-focus"
        />
      </TextField>
      <TextField isDisabled={actions.busy} className="gap-2">
        <Label accessible={false} onPress={() => passwordInput.current?.focus()}>
          <Label.Text nativeID="password-label" className="text-sm">
            {t("auth.password")}
          </Label.Text>
        </Label>
        <Input
          ref={passwordInput}
          accessibilityLabel={t("auth.password")}
          accessibilityLabelledBy="password-label"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          value={password}
          onChangeText={(value) => {
            actions.clearError();
            setPassword(value);
          }}
          onSubmitEditing={() => void signIn()}
          className="p-3 text-base ios:focus:outline-focus android:border-input android:focus:border-focus"
        />
      </TextField>
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
