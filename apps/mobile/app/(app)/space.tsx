import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Text } from "react-native";
import { Input } from "heroui-native/input";
import { Label } from "heroui-native/label";
import { TextField } from "heroui-native/text-field";
import { useWorkspace } from "../../src/agents/provider.js";
import { useCopy } from "../../src/locale.js";
import { Action, Screen } from "../../src/ui.js";

export default function SpaceScreen() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { t } = useCopy();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  async function create() {
    if (pending.current || !name.trim()) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      const membership = await workspace.port.spaces.create({ name: name.trim() });
      await workspace.refresh(membership.space.id);
      router.replace("/");
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        {t("agents.newSpace")}
      </Text>
      <TextField isDisabled={busy} className="gap-2">
        <Label>{t("agents.spaceName")}</Label>
        <Input
          accessibilityLabel={t("agents.spaceName")}
          value={name}
          maxLength={120}
          onChangeText={setName}
          onSubmitEditing={() => void create()}
          className="p-3 text-base"
        />
      </TextField>
      {error ? (
        <Text accessibilityRole="alert" className="text-foreground">
          {t("agents.saveError")}
        </Text>
      ) : null}
      <Action
        label={t("agents.createSpace")}
        busy={busy}
        disabled={!name.trim()}
        onPress={() => void create()}
      />
      <Action
        label={t("agents.cancel")}
        secondary
        disabled={busy}
        onPress={() => router.replace("/")}
      />
    </Screen>
  );
}
