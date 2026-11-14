import { useSyncExternalStore } from "react";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Label } from "heroui-native/label";
import { Spinner } from "heroui-native/spinner";
import { TextField } from "heroui-native/text-field";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import {
  groupConversationInputSchema,
  type Agent,
  type AgentId,
  type Conversation,
} from "@raypx/core/agents";
import { Action } from "../ui.js";
import { useCopy } from "../locale.js";
import type { MobileGroupsController } from "./controller.js";

const SafeScreen = withUniwind(SafeAreaView);

export function GroupsScreen({
  controller,
  agents,
  onOpen,
  onBack,
  onDelete,
}: {
  controller: MobileGroupsController;
  agents: readonly Agent[];
  onOpen(this: void, group: Conversation): void;
  onBack(this: void): void;
  onDelete(this: void, group: Conversation): void;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { t } = useCopy();
  if (state.editing) return <GroupEditor controller={controller} agents={agents} />;
  return (
    <SafeScreen className="flex-1 bg-background">
      <View className="w-full max-w-[800px] flex-1 self-center gap-3 p-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
            {t("agents.groups.title")}
          </Text>
          <Action label={t("agents.back")} secondary onPress={onBack} />
        </View>
        <Action label={t("agents.groups.new")} onPress={() => controller.edit()} />
        {state.error && (
          <Text accessibilityRole="alert" className="text-foreground">
            {t("agents.directoryError")}
          </Text>
        )}
        <FlatList
          data={state.groups}
          keyExtractor={(item) => item.id}
          accessibilityLabel={t("agents.groups.title")}
          refreshing={state.loading}
          onRefresh={() => void controller.load()}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View className="gap-2 border-b border-border py-3">
              <Action
                label={item.name ?? t("agents.groups.title")}
                secondary
                onPress={() => onOpen(item)}
              />
              <View className="flex-row flex-wrap gap-2">
                <Action
                  label={t("common.edit")}
                  secondary
                  disabled={state.busy}
                  onPress={() => controller.edit(item)}
                />
                <Action
                  label={t("agents.groups.delete")}
                  secondary
                  disabled={state.busy}
                  onPress={() => onDelete(item)}
                />
              </View>
            </View>
          )}
          ListEmptyComponent={
            state.loading ? (
              <Spinner accessibilityLabel={t("agents.loading")} />
            ) : (
              <Text className="py-6 text-muted-foreground">{t("agents.groups.new")}</Text>
            )
          }
        />
      </View>
    </SafeScreen>
  );
}

function GroupEditor({
  controller,
  agents,
}: {
  controller: MobileGroupsController;
  agents: readonly Agent[];
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { t } = useCopy();
  const valid = groupConversationInputSchema.safeParse({
    name: state.name,
    agentIds: state.selected,
  }).success;
  return (
    <SafeScreen className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerClassName="grow p-4" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-[800px] self-center gap-4">
            <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
              {t("agents.groups.title")}
            </Text>
            <TextField>
              <Label>{t("agents.groups.name")}</Label>
              <Input
                accessibilityLabel={t("agents.groups.name")}
                value={state.name}
                onChangeText={(value) => controller.setName(value)}
                maxLength={120}
                editable={!state.busy}
              />
            </TextField>
            <Text accessibilityRole="header" className="text-lg text-foreground">
              {t("agents.groups.chooseAgents")}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {t("agents.groups.count", { count: state.selected.length })}
            </Text>
            {agents.map((agent) => (
              <AgentChoice
                key={agent.id}
                agent={agent}
                checked={state.selected.includes(agent.id)}
                disabled={state.busy}
                onSelect={(id) => controller.toggle(id)}
              />
            ))}
            {state.error && (
              <Text accessibilityRole="alert" className="text-foreground">
                {t("agents.saveError")}
              </Text>
            )}
            <Action
              label={t(state.editing === "new" ? "agents.groups.create" : "agents.save")}
              busy={state.busy}
              disabled={!valid}
              onPress={() => void controller.save()}
            />
            <Action
              label={t("agents.cancel")}
              secondary
              disabled={state.busy}
              onPress={() => controller.cancel()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}
function AgentChoice({
  agent,
  checked,
  disabled,
  onSelect,
}: {
  agent: Agent;
  checked: boolean;
  disabled: boolean;
  onSelect(this: void, id: AgentId): void;
}) {
  return (
    <Button
      variant="ghost"
      accessibilityRole="checkbox"
      accessibilityLabel={agent.name}
      accessibilityState={{ checked, disabled }}
      isDisabled={disabled}
      onPress={() => onSelect(agent.id)}
      className="h-auto min-h-12 justify-start gap-3 p-3"
    >
      <Button.Label className="shrink text-foreground">
        {checked ? "✓ " : ""}
        {agent.name}
      </Button.Label>
    </Button>
  );
}
