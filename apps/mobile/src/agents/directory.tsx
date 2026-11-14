import logoMark from "@raypx/ui/logo-mark.webp";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Label } from "heroui-native/label";
import { Select } from "heroui-native/select";
import { Spinner } from "heroui-native/spinner";
import { TextArea } from "heroui-native/text-area";
import { TextField } from "heroui-native/text-field";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import type { AgentInput } from "@raypx/core/agents";
import {
  modelChoiceGroups,
  compareLastActivity,
  relativeActivityTime,
  type AgentConversationView,
  type GroupConversationView,
  type AgentsPageState,
  type OfferedModel,
} from "@raypx/agents/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";

const StyledSafeAreaView = withUniwind(SafeAreaView);

interface AgentDirectoryProps {
  state: AgentsPageState;
  accountName?: string | undefined;
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
  onGroups?: (() => void) | undefined;
  onOpenGroup?: ((item: GroupConversationView) => void) | undefined;
  onPages?: (() => void) | undefined;
  onSpaceSettings?: (() => void) | undefined;
  onNotifications?: (() => void) | undefined;
  onResources?: (() => void) | undefined;
  onRoutines?: (() => void) | undefined;
  onMemory?: (() => void) | undefined;
  onNew?: (() => void) | undefined;
  home?: ReactNode;
}

export function AgentDirectory({
  state,
  accountName,
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
  onGroups,
  onOpenGroup,
  onPages,
  onSpaceSettings,
  onResources,
  onNotifications,
  onRoutines,
  onMemory,
  onNew,
  home,
}: AgentDirectoryProps) {
  const { t } = useCopy();
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const agentsByActivity = useMemo(
    () => [...state.agents].sort((left, right) => compareLastActivity(left.agent, right.agent)),
    [state.agents],
  );
  const recent = useMemo(
    () =>
      [
        ...state.agents
          .filter((item) => item.agent.lastActivityAt)
          .map((item) => ({
            id: item.conversation.id,
            name: item.agent.name,
            lastActivityAt: item.agent.lastActivityAt,
            open: () => onOpen(item),
          })),
        ...(state.groups ?? [])
          .filter((item) => item.conversation.lastActivityAt)
          .map((item) => ({
            id: item.conversation.id,
            name: item.conversation.name ?? t("agents.groups.title"),
            lastActivityAt: item.conversation.lastActivityAt,
            open: () => onOpenGroup?.(item),
          })),
      ]
        .sort(compareLastActivity)
        .slice(0, 20),
    [state.agents, state.groups, onOpen, onOpenGroup, t],
  );
  let emptyMessage = t("agents.noSpaces");
  if (state.spaceId) emptyMessage = t("agents.noAgents");
  if (needle) emptyMessage = t("common.noResults");
  const membership = state.spaces.find((entry) => entry.space.id === state.spaceId);
  const space = membership?.space;
  function go(action: (() => void) | undefined) {
    setDirectoryOpen(false);
    action?.();
  }
  const content = (
    <View className="w-full max-w-[800px] flex-1 self-center bg-muted/30">
      <View className="flex-row items-center justify-between gap-2 px-4 py-2">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {t("mobile.workspace")}
        </Text>
        <Action label={t("common.close")} secondary onPress={() => setDirectoryOpen(false)} />
      </View>
      <FlatList
        accessibilityLabel={t("mobile.workspace")}
        data={
          agentsExpanded
            ? agentsByActivity.filter((item) =>
                item.agent.name.toLocaleLowerCase().includes(needle),
              )
            : []
        }
        keyExtractor={(item) => item.agent.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerClassName="grow gap-1 px-3 pb-4"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="gap-2 pb-2">
            <Input
              accessibilityLabel={t("common.search")}
              placeholder={t("common.search")}
              value={query}
              onChangeText={setQuery}
              className="min-h-11 rounded-xl bg-background px-3 py-2 text-base"
            />
            {onNotifications && (
              <Action
                label={t("agents.notifications.title")}
                secondary
                onPress={() => go(onNotifications)}
              />
            )}
            {space && <Action label={t("mobile.new")} secondary onPress={() => go(onNew)} />}
            {space && (
              <View className="gap-1">
                {onRoutines && (
                  <Action label={t("routines.title")} secondary onPress={() => go(onRoutines)} />
                )}
                {onPages && (
                  <Action label={t("pages.title")} secondary onPress={() => go(onPages)} />
                )}
                {onResources && (
                  <Action label={t("mobile.resources")} secondary onPress={() => go(onResources)} />
                )}
                {onMemory && (
                  <Action label={t("memory.space.title")} secondary onPress={() => go(onMemory)} />
                )}
              </View>
            )}
            <DirectorySection title={t("agents.space")}>
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
              ) : (
                space && <Text className="px-3 text-sm text-foreground">{space.name}</Text>
              )}
              {space && onSpaceSettings && (
                <Action
                  label={t("agents.spaceSettings.title")}
                  secondary
                  onPress={() => go(onSpaceSettings)}
                />
              )}
              <Action label={t("agents.createSpace")} secondary onPress={() => go(onCreateSpace)} />
            </DirectorySection>
            {error && (
              <View className="gap-2 px-3">
                <Text accessibilityRole="alert" className="text-sm text-foreground">
                  {t("agents.directoryError")}
                </Text>
                <Action
                  label={t("agents.refresh")}
                  secondary
                  busy={refreshing}
                  onPress={onRefresh}
                />
              </View>
            )}
            <View className="flex-row items-center justify-between gap-2 px-3 pt-3">
              <Button
                variant="ghost"
                accessibilityLabel={t("mobile.section", { name: t("agents.title") })}
                accessibilityState={{ expanded: agentsExpanded }}
                onPress={() => setAgentsExpanded((value) => !value)}
                className="h-auto min-h-11 px-0 py-2"
              >
                <Button.Label className="text-xs font-medium text-muted-foreground">
                  {t("agents.title")}
                </Button.Label>
              </Button>
              {space && state.agents.length > 0 && (
                <Action label={t("agents.createAgent")} secondary onPress={() => go(onCreate)} />
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <AgentRow
            item={item}
            modelName={
              state.models.find((model) => model.modelId === item.agent.model.modelId)?.name ??
              item.agent.model.modelId
            }
            onOpen={(entry) => go(() => onOpen(entry))}
            onEdit={(entry) => go(() => onEdit(entry))}
            onDelete={onDelete}
          />
        )}
        ListEmptyComponent={
          agentsExpanded ? (
            <View className="gap-3 rounded-xl bg-background p-4">
              {loading && <Spinner accessibilityLabel={t("agents.loading")} />}
              {!loading && !error && (
                <>
                  <Text className="text-sm text-muted-foreground">{emptyMessage}</Text>
                  {space && !needle && (
                    <Action label={t("agents.createAgent")} onPress={() => go(onCreate)} />
                  )}
                </>
              )}
            </View>
          ) : undefined
        }
        ListFooterComponent={
          <View className="gap-3 pt-3">
            {space && (
              <DirectorySection title={t("agents.groups.title")}>
                {(state.groups ?? [])
                  .filter((item) => item.conversation.name?.toLocaleLowerCase().includes(needle))
                  .map((item) => (
                    <DirectoryRow
                      key={item.conversation.id}
                      label={item.conversation.name ?? t("agents.groups.title")}
                      onPress={() => go(() => onOpenGroup?.(item))}
                    />
                  ))}
                {onGroups && (
                  <Action label={t("agents.groups.new")} secondary onPress={() => go(onGroups)} />
                )}
              </DirectorySection>
            )}
            <DirectorySection title={t("mobile.recent")}>
              {recent
                .filter((item) => item.name.toLocaleLowerCase().includes(needle))
                .map((item) => (
                  <DirectoryRow key={item.id} label={item.name} onPress={() => go(item.open)} />
                ))}
              {recent.length === 0 && (
                <Text className="px-3 text-xs text-muted-foreground">{t("mobile.noRecent")}</Text>
              )}
            </DirectorySection>
          </View>
        }
      />
      <View className="gap-1 px-3 py-2">
        <Button
          variant="ghost"
          accessibilityLabel={t("common.account")}
          onPress={() => go(onAccount)}
          className="h-auto min-h-12 justify-start gap-3 rounded-xl px-3 py-2"
        >
          <Avatar alt={t("common.account")} color="default" accessible={false}>
            <Avatar.Fallback>
              {(accountName?.trim() || "R").slice(0, 2).toLocaleUpperCase()}
            </Avatar.Fallback>
          </Avatar>
          <View className="min-w-0 flex-1 gap-1">
            <Text numberOfLines={1} className="text-sm font-medium text-foreground">
              {accountName || t("common.account")}
            </Text>
            {membership && (
              <Text className="text-xs text-muted-foreground">
                {t(`agents.spaceSettings.roles.${membership.member.role}`)}
              </Text>
            )}
          </View>
        </Button>
        {membership?.member.role === "owner" && onSpaceSettings && (
          <Action label={t("mobile.inviteMembers")} secondary onPress={() => go(onSpaceSettings)} />
        )}
      </View>
    </View>
  );
  return (
    <StyledSafeAreaView className="flex-1 bg-background">
      <View
        accessibilityElementsHidden={directoryOpen}
        importantForAccessibility={directoryOpen ? "no-hide-descendants" : "auto"}
        className="flex-row items-center justify-between gap-2 px-4 py-2"
      >
        <Image source={logoMark} accessibilityLabel="Raypx" className="size-7" />
        <Action label={t("mobile.workspace")} secondary onPress={() => setDirectoryOpen(true)} />
      </View>
      <View
        accessibilityElementsHidden={directoryOpen}
        importantForAccessibility={directoryOpen ? "no-hide-descendants" : "auto"}
        className="flex-1"
      >
        {home ?? (
          <View className="flex-1 items-center justify-center gap-4 px-6">
            <Text
              accessibilityRole="header"
              className="text-center text-2xl font-medium text-foreground"
            >
              {t("mobile.homeQuestion")}
            </Text>
          </View>
        )}
      </View>
      <Modal
        visible={directoryOpen}
        animationType="none"
        presentationStyle="pageSheet"
        onRequestClose={() => setDirectoryOpen(false)}
      >
        <StyledSafeAreaView
          className="flex-1 bg-muted/30"
          accessibilityViewIsModal
          onAccessibilityEscape={() => setDirectoryOpen(false)}
        >
          {content}
        </StyledSafeAreaView>
      </Modal>
    </StyledSafeAreaView>
  );
}

function DirectoryRow({ label, onPress }: { label: string; onPress(this: void): void }) {
  return (
    <Button
      variant="ghost"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-auto min-h-11 justify-start rounded-lg px-3 py-2"
    >
      <Button.Label numberOfLines={1} className="min-w-0 flex-1 text-left text-sm">
        {label}
      </Button.Label>
    </Button>
  );
}

function DirectorySection({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useCopy();
  const [expanded, setExpanded] = useState(true);
  return (
    <View className="gap-1">
      <Button
        variant="ghost"
        accessibilityLabel={t("mobile.section", { name: title })}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        className="h-auto min-h-11 justify-start px-3 py-2"
      >
        <Button.Label className="text-xs font-medium text-muted-foreground">{title}</Button.Label>
      </Button>
      {expanded && children}
    </View>
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
  const { t } = useCopy();
  function more() {
    Alert.alert(item.agent.name, undefined, [
      { text: t("agents.editAgent"), onPress: () => onEdit(item) },
      { text: t("agents.deleteAgent"), style: "destructive", onPress: () => onDelete(item) },
      { text: t("agents.cancel"), style: "cancel" },
    ]);
  }
  return (
    <View className="flex-row items-center gap-1">
      <Button
        accessibilityLabel={item.agent.name}
        variant="ghost"
        onPress={() => onOpen(item)}
        className="h-auto min-h-11 min-w-0 flex-1 justify-start rounded-lg px-3 py-2"
      >
        <View className="min-w-0 flex-1 gap-1">
          <Text numberOfLines={1} className="text-sm text-foreground">
            {item.agent.name}
          </Text>
          <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {modelName}
          </Text>
          <ActivityTime value={item.agent.lastActivityAt} />
        </View>
      </Button>
      <Button
        variant="ghost"
        accessibilityLabel={t("mobile.agentActions", { name: item.agent.name })}
        onPress={more}
        className="min-h-11 min-w-11 rounded-lg px-3"
      >
        <Button.Label>…</Button.Label>
      </Button>
    </View>
  );
}

function ActivityTime({ value }: { value?: string | null | undefined }) {
  const { locale, t } = useCopy();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!value) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [value]);
  const label = value
    ? t("agents.activity.active", { time: relativeActivityTime(value, locale, now) })
    : t("agents.activity.none");
  return <Text className="text-xs text-muted-foreground">{label}</Text>;
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

export function Choice({
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
