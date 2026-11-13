import { useState } from "react";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Label } from "heroui-native/label";
import { Select } from "heroui-native/select";
import { Spinner } from "heroui-native/spinner";
import { TextArea } from "heroui-native/text-area";
import { TextField } from "heroui-native/text-field";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import type { AgentInput } from "@raypx/core/agents";
import {
  modelChoiceGroups,
  type AgentConversationView,
  type AgentsPageState,
  type OfferedModel,
} from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";

const StyledSafeAreaView = withUniwind(SafeAreaView);

interface AgentDirectoryProps {
  state: AgentsPageState;
  loading: boolean;
  error: boolean;
  refreshing: boolean;
  onRefresh(this: void): void;
  onSelectSpace(this: void, id: string): void;
  onOpen(this: void, item: AgentConversationView): void;
  onCreate(this: void): void;
  onEdit(this: void, item: AgentConversationView): void;
  onDelete(this: void, item: AgentConversationView): void;
  onAccount(this: void): void;
  onCreateSpace(this: void): void;
}

export function AgentDirectory({
  state,
  loading,
  error,
  refreshing,
  onRefresh,
  onSelectSpace,
  onOpen,
  onCreate,
  onEdit,
  onDelete,
  onAccount,
  onCreateSpace,
}: AgentDirectoryProps) {
  const { t } = useCopy();
  const space = state.spaces.find((entry) => entry.space.id === state.spaceId)?.space;
  return (
    <StyledSafeAreaView className="flex-1 bg-background">
      <View className="w-full max-w-[800px] flex-1 self-center">
        <View className="gap-3 border-b border-border px-4 py-3">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
              {t("agents.title")}
            </Text>
            <Action label={t("common.account")} secondary onPress={onAccount} />
          </View>
          {state.spaces.length > 1 ? (
            <Choice
              label={t("agents.space")}
              placeholder={t("agents.space")}
              options={state.spaces.map((entry) => ({
                value: entry.space.id,
                label: entry.space.name,
              }))}
              value={space?.id ?? ""}
              onChange={onSelectSpace}
            />
          ) : null}
          {state.spaces.length === 1 && space ? (
            <Text className="text-sm text-muted-foreground">{space.name}</Text>
          ) : null}
          {space ? <Action label={t("agents.newAgent")} onPress={onCreate} /> : null}
          {error ? (
            <View className="gap-2">
              <Text accessibilityRole="alert" className="text-sm text-foreground">
                {t("agents.directoryError")}
              </Text>
              <Action label={t("agents.refresh")} secondary busy={refreshing} onPress={onRefresh} />
            </View>
          ) : null}
        </View>
        <FlatList
          accessibilityLabel={t("agents.title")}
          data={state.agents}
          keyExtractor={(item) => item.agent.id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerClassName="grow px-4 py-2"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <AgentRow
              item={item}
              modelName={
                state.models.find((model) => model.modelId === item.agent.model.modelId)?.name ??
                item.agent.model.modelId
              }
              onOpen={onOpen}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center gap-4 py-12">
              {loading ? <Spinner accessibilityLabel={t("agents.loading")} /> : null}
              {!loading && !error ? (
                <>
                  <Text className="text-center text-base text-muted-foreground">
                    {t(space ? "agents.noAgents" : "agents.noSpaces")}
                  </Text>
                  {!space ? (
                    <Action label={t("agents.createSpace")} onPress={onCreateSpace} />
                  ) : null}
                </>
              ) : null}
            </View>
          }
        />
      </View>
    </StyledSafeAreaView>
  );
}

function AgentRow({
  item,
  modelName,
  onOpen,
  onEdit,
  onDelete,
}: {
  item: AgentConversationView;
  modelName: string;
  onOpen(this: void, item: AgentConversationView): void;
  onEdit(this: void, item: AgentConversationView): void;
  onDelete(this: void, item: AgentConversationView): void;
}) {
  const { locale, t } = useCopy();
  const initials = Array.from(item.agent.name.trim())
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase(locale);
  // The contract has no last-message timestamp. Label the available timestamp honestly.
  const date = new Date(item.agent.updatedAt).toLocaleString(locale);
  return (
    <View className="gap-1 border-b border-border py-3">
      <Button
        accessibilityLabel={item.agent.name}
        variant="ghost"
        onPress={() => onOpen(item)}
        className="h-auto min-h-16 justify-start gap-3 rounded-lg px-2 py-3"
      >
        <Avatar alt={item.agent.name} color="default" accessible={false}>
          <Avatar.Fallback>{initials}</Avatar.Fallback>
        </Avatar>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base font-semibold text-foreground">{item.agent.name}</Text>
          <Text className="text-sm text-muted-foreground">{modelName}</Text>
          <Text className="text-xs text-muted-foreground">{t("mobile.lastEdited", { date })}</Text>
        </View>
      </Button>
      <View className="flex-row flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          accessibilityLabel={`${t("agents.editAgent")}: ${item.agent.name}`}
          className="h-auto min-h-11 px-3 py-2"
          onPress={() => onEdit(item)}
        >
          <Button.Label className="shrink text-sm">{t("agents.editAgent")}</Button.Label>
        </Button>
        <Button
          variant="ghost"
          accessibilityLabel={`${t("agents.deleteAgent")}: ${item.agent.name}`}
          className="h-auto min-h-11 px-3 py-2"
          onPress={() => onDelete(item)}
        >
          <Button.Label className="shrink text-sm">{t("agents.deleteAgent")}</Button.Label>
        </Button>
      </View>
    </View>
  );
}

export function AgentEditor({
  item,
  models,
  busy,
  error,
  onSave,
  onCancel,
}: {
  item?: AgentConversationView | undefined;
  models: OfferedModel[];
  busy: boolean;
  error: boolean;
  onSave(this: void, agent: AgentInput): void;
  onCancel(this: void): void;
}) {
  const { t } = useCopy();
  const [name, setName] = useState(item?.agent.name ?? "");
  const [instructions, setInstructions] = useState(item?.agent.instructions ?? "");
  const [modelId, setModelId] = useState(item?.agent.model.modelId ?? models[0]?.modelId ?? "");
  const modelOffered = models.some((model) => model.modelId === modelId);
  const groupedModels = modelChoiceGroups(models);
  const modelGroups = (["connection", "deployment"] as const)
    .map((source) => ({
      label: t(
        source === "connection"
          ? "agents.connections.memberModels"
          : "agents.connections.deploymentModels",
      ),
      options: groupedModels[source].map((model) => ({
        value: model.modelId,
        label: model.name,
        description: t(`mobile.modelSource.${model.source}`),
      })),
    }))
    .filter((group) => group.options.length > 0);
  const canSave = name.trim().length > 0 && modelOffered && !busy;
  function save() {
    if (!canSave) return;
    onSave({ name: name.trim(), instructions, model: { modelId } });
  }
  return (
    <StyledSafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerClassName="grow p-4" keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-[640px] self-center gap-5">
            <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
              {t(item ? "agents.editAgent" : "agents.newAgent")}
            </Text>
            <TextField isDisabled={busy} className="gap-2">
              <Label>{t("agents.name")}</Label>
              <Input
                accessibilityLabel={t("agents.name")}
                value={name}
                onChangeText={setName}
                maxLength={120}
                autoCapitalize="sentences"
                className="p-3 text-base"
              />
            </TextField>
            <TextField isDisabled={busy} className="gap-2">
              <Label>{t("agents.instructions")}</Label>
              <TextArea
                accessibilityLabel={t("agents.instructions")}
                value={instructions}
                onChangeText={setInstructions}
                maxLength={32_000}
                multiline
                className="min-h-40 p-3 text-base"
                textAlignVertical="top"
              />
            </TextField>
            {models.length === 0 ? (
              <Text accessibilityRole="alert" className="text-base text-muted-foreground">
                {t("agents.noModels")}
              </Text>
            ) : (
              <>
                <Choice
                  label={t("agents.model")}
                  placeholder={t("agents.chooseModel")}
                  options={modelGroups.flatMap((group) => group.options)}
                  groups={modelGroups}
                  value={modelId}
                  onChange={setModelId}
                  disabled={busy}
                />
                {!modelOffered && modelId ? (
                  <Text accessibilityRole="alert" className="text-sm text-muted-foreground">
                    {t("agents.unavailableModel", { model: modelId })}
                  </Text>
                ) : null}
              </>
            )}
            {error ? (
              <Text accessibilityRole="alert" className="text-base text-foreground">
                {t("agents.saveError")}
              </Text>
            ) : null}
            <Action
              label={t(item ? "agents.save" : "agents.createAgent")}
              busy={busy}
              disabled={!canSave}
              onPress={save}
            />
            <Action label={t("agents.cancel")} secondary disabled={busy} onPress={onCancel} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </StyledSafeAreaView>
  );
}

interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
}

function ChoiceItem({ option }: { option: ChoiceOption }) {
  return (
    <Select.Item
      value={option.value}
      label={option.label}
      accessibilityLabel={
        option.description ? `${option.label}, ${option.description}` : option.label
      }
      className="min-h-12 py-3"
    >
      <View className="min-w-0 flex-1 gap-1">
        <Select.ItemLabel className="text-base" />
        {option.description ? (
          <Text className="text-xs text-muted-foreground">{option.description}</Text>
        ) : null}
      </View>
      <Select.ItemIndicator />
    </Select.Item>
  );
}

function Choice({
  label,
  placeholder,
  options,
  groups,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  options: ChoiceOption[];
  groups?: { label: string; options: ChoiceOption[] }[];
  value: string;
  onChange(this: void, value: string): void;
  disabled?: boolean;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <Select
        value={selected}
        onValueChange={(option) => {
          if (option) onChange(option.value);
        }}
        isDisabled={disabled}
      >
        <Select.Trigger accessibilityLabel={label} className="min-h-12 justify-between px-3 py-3">
          <View className="min-w-0 flex-1 gap-1">
            <Select.Value placeholder={placeholder} className="text-base" />
            {selected?.description ? (
              <Text className="text-xs text-muted-foreground">{selected.description}</Text>
            ) : null}
          </View>
          <Select.TriggerIndicator />
        </Select.Trigger>
        <Select.Portal unstable_accessibilityContainerViewIsModal>
          <Select.Overlay />
          <Select.Content presentation="popover" width="trigger">
            <ScrollView className="max-h-72" keyboardShouldPersistTaps="handled">
              {(groups ?? [{ label: "", options }]).map((group) => (
                <View key={group.label} className="gap-1">
                  {group.label ? (
                    <Select.ListLabel accessibilityRole="header">{group.label}</Select.ListLabel>
                  ) : null}
                  {group.options.map((option) => (
                    <ChoiceItem key={option.value} option={option} />
                  ))}
                </View>
              ))}
            </ScrollView>
          </Select.Content>
        </Select.Portal>
      </Select>
    </View>
  );
}
