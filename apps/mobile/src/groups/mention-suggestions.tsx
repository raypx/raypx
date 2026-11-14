import { Button } from "heroui-native/button";
import { FlatList, Text, View } from "react-native";
import type { Agent } from "@raypx/core/agents";
import { Action } from "../ui.js";
import { useCopy } from "../locale.js";

/** Suggestions are native options; only an explicit selection creates a structural mention. */
export function MentionSuggestions({
  agents,
  query,
  onSelect,
  onClose,
}: {
  agents: readonly Agent[];
  query: string;
  onSelect(this: void, agent: Agent): void;
  onClose(this: void): void;
}) {
  const { t } = useCopy();
  const matches = agents.filter((agent) =>
    agent.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <View
      className="max-h-52 rounded-lg border border-border bg-background p-2"
      accessibilityLabel={t("agents.mentions.picker")}
    >
      <FlatList
        accessibilityLabel={t("agents.mentions.search")}
        data={matches}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(agent) => agent.id}
        renderItem={({ item }) => (
          <Button
            variant="ghost"
            accessibilityLabel={item.name}
            onPress={() => onSelect(item)}
            className="h-auto min-h-12 justify-start p-3"
          >
            <Button.Label className="shrink">{item.name}</Button.Label>
          </Button>
        )}
        ListEmptyComponent={
          <Text className="p-3 text-muted-foreground">{t("agents.mentions.empty")}</Text>
        }
      />
      <Action label={t("agents.close")} secondary onPress={onClose} />
    </View>
  );
}
