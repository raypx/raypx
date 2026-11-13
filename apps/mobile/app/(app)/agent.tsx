import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Text } from "react-native";
import { Spinner } from "heroui-native/spinner";
import type { AgentInput } from "@raypx/core/agents";
import { AgentEditor } from "../../src/agents/directory.js";
import { useRouteSelection } from "../../src/agents/route-selection.js";
import { useCopy } from "../../src/locale.js";
import { Action, Screen } from "../../src/ui.js";

export default function AgentFormScreen() {
  const { workspace, view, selected, current, item } = useRouteSelection();
  const router = useRouter();
  const { t } = useCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  async function save(agent: AgentInput) {
    if (pending.current || !current || !selected.spaceId || (selected.agentId && !item)) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      const input = { spaceId: selected.spaceId, agent };
      const saved = item
        ? await workspace.port.agents.update({ ...input, id: item.agent.id })
        : await workspace.port.agents.create(input);
      await workspace.refresh(saved.agent.spaceId);
      router.replace({
        pathname: "/conversation/[agentId]",
        params: { agentId: saved.agent.id, spaceId: saved.agent.spaceId },
      });
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (view.loading || view.refreshing || !current)
    return (
      <Screen>
        {view.error || !selected.spaceId || (!current && !view.loading && !view.refreshing) ? (
          <>
            <Text accessibilityRole="alert" className="text-foreground">
              {t("agents.directoryError")}
            </Text>
            <Action label={t("agents.back")} onPress={() => router.replace("/")} />
          </>
        ) : (
          <Spinner accessibilityLabel={t("agents.loading")} />
        )}
      </Screen>
    );
  if (selected.agentId && !item)
    return (
      <Screen>
        <Text accessibilityRole="alert" className="text-foreground">
          {t("agents.directoryError")}
        </Text>
        <Action label={t("agents.back")} onPress={() => router.replace("/")} />
      </Screen>
    );
  return (
    <AgentEditor
      key={item?.agent.id ?? selected.spaceId}
      item={item}
      models={view.page.models}
      busy={busy}
      error={error}
      onSave={(agent) => void save(agent)}
      onCancel={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }}
    />
  );
}
