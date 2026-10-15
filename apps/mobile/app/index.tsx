import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { useLocale, useTranslations } from "@raypx/i18n/native";
import { Action, Field, Heading, Notice, Screen } from "../src/components";
import { useAuthActions } from "@raypx/auth/hooks";
import { apiClient, authClient, webUrl } from "../src/account";

type Mode = "login" | "signup" | "forgot" | "verify";
export default function Account() {
  const c = useTranslations("common");
  const t = useTranslations("auth");
  const locale = useLocale();
  const session = authClient.useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const auth = useAuthActions({ client: authClient, locale, webUrl });
  const { busy } = auth;
  const [localError, setLocalError] = useState("");
  const [message, setMessage] = useState("");
  const error =
    localError ||
    (!auth.error
      ? ""
      : auth.error.kind !== "auth"
        ? c("networkError")
        : auth.error.key === "generic"
          ? c("error")
          : t(auth.error.key));
  const [account, setAccount] = useState<{ id: string; name: string; email: string } | null>(null);
  const userId = session.data?.user.id;
  useEffect(() => {
    let active = true;
    setAccount(null);
    if (userId)
      void apiClient.account
        .get({})
        .then((value) => {
          if (active) setAccount(value);
        })
        .catch(() => {
          if (active) setLocalError(c("networkError"));
        });
    return () => {
      active = false;
    };
  }, [userId, c]);
  function change(value: Mode) {
    setMode(value);
    auth.clearError();
    setLocalError("");
    setMessage("");
    setPassword("");
  }
  async function submit() {
    if (busy) return;
    auth.clearError();
    if (
      (mode === "signup" && password.length < 8) ||
      (mode === "login" && !password) ||
      !email.trim() ||
      (mode === "signup" && !name.trim())
    ) {
      setLocalError(
        mode === "signup" && password.length < 8 ? t("passwordShort") : c("requiredFields"),
      );
      return;
    }
    setLocalError("");
    setMessage("");
    const result =
      mode === "login"
        ? await auth.signIn({ email, password })
        : mode === "signup"
          ? await auth.signUp({ name, email, password })
          : mode === "forgot"
            ? await auth.requestPasswordReset({ email })
            : await auth.sendVerificationEmail({ email });
    if (result.status !== "success") return;
    if (mode === "signup") {
      setMode("verify");
      setMessage(t("verifyIntro"));
      setPassword("");
    } else if (mode === "forgot") setMessage(t("resetSent"));
    else if (mode === "verify") setMessage(t("verifySent"));
    else setPassword("");
  }
  async function signOut() {
    if (busy) return;
    setLocalError("");
    await auth.signOut(() => {
      setAccount(null);
      setPassword("");
    });
  }
  const user = account ?? session.data?.user;
  return (
    <Screen>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted-foreground">Raypx</Text>
        <Heading
          title={
            session.data
              ? t("accountTitle")
              : mode === "signup"
                ? t("signup")
                : mode === "forgot"
                  ? t("reset")
                  : mode === "verify"
                    ? t("verify")
                    : t("login")
          }
          detail={session.data ? t("accountIntro") : t("intro")}
        />
      </View>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {session.isPending ? (
        <View accessibilityLabel={c("loading")} className="gap-4">
          <View className="size-14 rounded-full bg-muted" />
          <View className="h-5 w-48 rounded bg-muted" />
          <View className="h-5 w-64 rounded bg-muted" />
        </View>
      ) : session.error ? (
        <>
          <Notice error>{c("networkError")}</Notice>
          <Action secondary onPress={() => void session.refetch()}>
            {c("retry")}
          </Action>
        </>
      ) : session.data && user ? (
        <>
          <View className="flex-row items-center gap-4">
            <View className="size-14 rounded-full bg-muted items-center justify-center">
              <Text className="text-2xl text-foreground">
                {user.name.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-xl font-semibold text-foreground">{user.name}</Text>
              <Text className="text-base text-muted-foreground">{user.email}</Text>
            </View>
          </View>
          <View className="gap-5 border-t border-border pt-6">
            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">{t("name")}</Text>
              <Text className="text-base text-foreground">{user.name}</Text>
            </View>
            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">{t("email")}</Text>
              <Text className="text-base text-foreground">{user.email}</Text>
            </View>
            <Text className="text-sm text-muted-foreground">{t("verifiedLabel")}</Text>
          </View>
          <Action secondary busy={busy} onPress={() => void signOut()}>
            {c("signOut")}
          </Action>
        </>
      ) : (
        <View className="gap-5">
          {mode === "forgot" && (
            <Text className="text-base leading-6 text-muted-foreground">{t("resetIntro")}</Text>
          )}
          {mode === "verify" && (
            <Text className="text-base leading-6 text-muted-foreground">{t("verifyIntro")}</Text>
          )}
          {mode === "signup" && (
            <Field
              label={t("name")}
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              editable={!busy}
              maxLength={120}
            />
          )}
          <Field
            label={t("email")}
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
          {(mode === "login" || mode === "signup") && (
            <Field
              label={t("password")}
              value={password}
              onChangeText={setPassword}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              textContentType={mode === "login" ? "password" : "newPassword"}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              maxLength={128}
            />
          )}
          <Action busy={busy} onPress={() => void submit()}>
            {mode === "login"
              ? c("signIn")
              : mode === "signup"
                ? t("create")
                : mode === "forgot"
                  ? t("sendReset")
                  : t("resend")}
          </Action>
          {mode === "login" ? (
            <>
              <Action secondary onPress={() => change("signup")}>
                {t("create")}
              </Action>
              <Action secondary onPress={() => change("forgot")}>
                {t("forgot")}
              </Action>
              <Action secondary onPress={() => change("verify")}>
                {t("resend")}
              </Action>
            </>
          ) : (
            <Action secondary onPress={() => change("login")}>
              {c("signIn")}
            </Action>
          )}
          <Text className="text-sm leading-6 text-muted-foreground">{t("webLink")}</Text>
          <Action
            secondary
            onPress={() =>
              void Linking.openURL(`${webUrl}/login`).catch(() => setLocalError(c("error")))
            }
          >
            {t("openWeb")}
          </Action>
        </View>
      )}
    </Screen>
  );
}
