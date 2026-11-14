import { FlatList, Text, View } from "react-native";
import type { AgentConversationView } from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";
import { CapabilityLayout } from "./layout.js";

/** Group capability actions choose the Agent whose routines and private memory are shown. */
export function CapabilityAgentChooser({
  title,
  agents,
  loading,
  error,
  onChoose,
  onRefresh,
  onBack,
}: {
  title: string;
  agents: AgentConversationView[];
  loading: boolean;
  error: boolean;
  onChoose(this: void, agentId: string): void;
  onRefresh(this: void): void;
  onBack(this: void): void;
}) {
  const { t } = useCopy();
  return (
    <CapabilityLayout title={title} scroll={false}>
      <Text className="text-base text-muted-foreground">
        {t("mobile-capabilities.chooseAgent")}
      </Text>
      {error ? (
        <Text accessibilityRole="alert" className="text-base text-foreground">
          {t("agents.directoryError")}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <Action label={t("agents.refresh")} secondary busy={loading} onPress={onRefresh} />
        <Action label={t("agents.back")} secondary onPress={onBack} />
      </View>
      <FlatList
        accessibilityLabel={t("agents.title")}
        data={agents}
        keyExtractor={(item) => item.agent.id}
        refreshing={loading}
        onRefresh={onRefresh}
        renderItem={({ item }) => (
          <View className="border-b border-border py-2">
            <Action label={item.agent.name} secondary onPress={() => onChoose(item.agent.id)} />
          </View>
        )}
        ListEmptyComponent={
          <Text className="text-base text-muted-foreground">
            {t(loading ? "agents.loading" : "agents.noAgents")}
          </Text>
        }
      />
    </CapabilityLayout>
  );
}
