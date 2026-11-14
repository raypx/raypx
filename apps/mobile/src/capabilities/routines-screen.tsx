import { useState, useSyncExternalStore } from "react";
import { FlatList, Text, View } from "react-native";
import { Spinner } from "heroui-native/spinner";
import {
  routineDelayMinutes,
  routineIngressAddress,
  routineLastOutcome,
  routineOccurrences,
  routineTriggerKinds,
  type RoutineIngressKind,
} from "@raypx/jobs/model";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";
import { CapabilityField, CapabilityLayout, CapabilityToggle } from "./layout.js";
import type { MobileRoutinesController } from "./routines-controller.js";

const ingressKinds: RoutineIngressKind[] = ["webhook", "email", "repository"];
export function MobileRoutinesScreen({
  controller,
  agentName,
  onBack,
  onCopy,
  onOpenRun,
}: {
  controller: MobileRoutinesController;
  agentName: string;
  onBack(this: void): void;
  onCopy(this: void, value: string): Promise<void>;
  onOpenRun?(this: void, conversationId: string, runId: string): void;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { t, locale } = useCopy();
  const [previewTime] = useState(() => new Date());
  const [copyState, setCopyState] = useState<"copied" | "error" | null>(null);
  async function copy(value: string) {
    try {
      await onCopy(value);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }
  const title = t("mobile-capabilities.routineAgent", { name: agentName });
  const feedback = (
    <>
      {state.loading ? <Spinner accessibilityLabel={t("routines.loading")} /> : null}
      {state.error ? (
        <Text accessibilityRole="alert" className="text-base text-foreground">
          {t(`routines.${state.error}`)}
        </Text>
      ) : null}
      {copyState ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-foreground">
          {t(copyState === "copied" ? "routines.copied" : "mobile-capabilities.copyFailed")}
        </Text>
      ) : null}
    </>
  );
  if (state.editor) {
    const { form, current } = state.editor;
    const occurrences = form.selected.schedule
      ? routineOccurrences(form.cron, form.timezone, previewTime)
      : [];
    return (
      <CapabilityLayout title={title}>
        {feedback}
        <Text className="text-sm text-muted-foreground">{t("routines.ownershipNotice")}</Text>
        <CapabilityField
          label={t("routines.name")}
          value={form.name}
          maxLength={120}
          disabled={state.busy}
          onChange={(name) => controller.change({ name })}
        />
        <CapabilityField
          label={t("routines.prompt")}
          value={form.prompt}
          maxLength={32000}
          multiline
          disabled={state.busy}
          onChange={(prompt) => controller.change({ prompt })}
        />
        <CapabilityToggle
          label={t("routines.enabled")}
          value={form.enabled}
          disabled={state.busy}
          onChange={(enabled) => controller.change({ enabled })}
        />
        <Text accessibilityRole="header" className="text-lg text-foreground">
          {t("routines.triggers")}
        </Text>
        {routineTriggerKinds.map((kind) => (
          <CapabilityToggle
            key={kind}
            label={t(`routines.${kind}`)}
            value={form.selected[kind]}
            disabled={state.busy}
            onChange={(enabled) =>
              controller.change({ selected: { ...form.selected, [kind]: enabled } })
            }
          />
        ))}
        {form.selected.schedule ? (
          <>
            <CapabilityField
              label={t("routines.cronExpression")}
              value={form.cron}
              disabled={state.busy}
              onChange={(cron) => controller.change({ cron })}
            />
            <CapabilityField
              label={t("routines.timezone")}
              value={form.timezone}
              disabled={state.busy}
              onChange={(timezone) => controller.change({ timezone })}
            />
            {occurrences.length ? (
              <View className="gap-1">
                <Text className="text-sm text-muted-foreground">
                  {t("routines.nextOccurrences")}
                </Text>
                {occurrences.map((time) => (
                  <Text key={time} className="text-sm text-foreground">
                    {new Date(time).toLocaleString(locale, { timeZone: form.timezone })} (
                    {form.timezone})
                  </Text>
                ))}
              </View>
            ) : (
              <Text accessibilityRole="alert" className="text-sm text-foreground">
                {t("routines.invalidCron")}
              </Text>
            )}
          </>
        ) : null}
        {form.selected.email ? (
          <CapabilityField
            label={t("routines.allowedSender")}
            value={form.allowedSender}
            disabled={state.busy}
            onChange={(allowedSender) => controller.change({ allowedSender })}
          />
        ) : null}
        {form.selected.repository ? (
          <CapabilityField
            label={t("routines.eventKinds")}
            value={form.repositoryEvents}
            disabled={state.busy}
            onChange={(repositoryEvents) => controller.change({ repositoryEvents })}
          />
        ) : null}
        {current
          ? ingressKinds
              .filter((kind) => form.selected[kind])
              .map((kind) => {
                const address = routineIngressAddress(current, kind);
                let reason:
                  | "routines.ingressUnavailable"
                  | "routines.publicAddressUnavailable"
                  | "routines.emailUnavailable"
                  | "routines.triggerUnavailable" = "routines.ingressUnavailable";
                if (address.unavailableReason === "PUBLIC_API_ORIGIN_NOT_CONFIGURED")
                  reason = "routines.publicAddressUnavailable";
                if (address.unavailableReason === "EMAIL_NOT_CONFIGURED")
                  reason = "routines.emailUnavailable";
                if (address.unavailableReason === "TRIGGER_NOT_CONFIGURED")
                  reason = "routines.triggerUnavailable";
                return (
                  <View key={kind} className="gap-2 border-t border-border pt-3">
                    <Text className="text-base font-semibold text-foreground">
                      {t(`routines.${kind}`)}
                    </Text>
                    <Text selectable className="text-sm text-foreground">
                      {address.value ?? t(reason)}
                    </Text>
                    {address.value ? (
                      <Action
                        label={`${t("mobile-capabilities.copyAddress")}: ${t(`routines.${kind}`)}`}
                        secondary
                        onPress={() => void copy(address.value!)}
                      />
                    ) : null}
                  </View>
                );
              })
          : null}
        {state.secrets.webhookKey || state.secrets.repositorySecret ? (
          <View className="gap-2">
            <Text className="text-sm text-foreground">{t("routines.secretOnce")}</Text>
            {state.secrets.webhookKey ? (
              <Action
                label={t("routines.copyKey")}
                secondary
                onPress={() => void copy(state.secrets.webhookKey!)}
              />
            ) : null}
            {state.secrets.repositorySecret ? (
              <Action
                label={t("routines.copySecret")}
                secondary
                onPress={() => void copy(state.secrets.repositorySecret!)}
              />
            ) : null}
          </View>
        ) : null}
        <Action
          label={t(current ? "routines.save" : "routines.createRoutine")}
          busy={state.busy}
          onPress={() => void controller.save()}
        />
        <Action
          label={t("mobile-capabilities.backToList")}
          secondary
          disabled={state.busy}
          onPress={() => {
            setCopyState(null);
            controller.close();
          }}
        />
      </CapabilityLayout>
    );
  }
  if (state.history)
    return (
      <CapabilityLayout title={t("routines.runHistory")} scroll={false}>
        {feedback}
        <Action
          label={t("mobile-capabilities.backToList")}
          secondary
          onPress={() => controller.close()}
        />
        <Action
          label={t("routines.refresh")}
          secondary
          busy={state.loading}
          onPress={() => void controller.openHistory(state.history!.routine)}
        />
        <FlatList
          data={state.history.entries}
          keyExtractor={(entry) => entry.id}
          accessibilityLabel={t("routines.runHistory")}
          ListEmptyComponent={
            <Text className="text-base text-muted-foreground">{t("routines.noRuns")}</Text>
          }
          renderItem={({ item }) => (
            <View className="gap-2 border-b border-border py-3">
              <Text className="text-base text-foreground">
                {t(`routines.${routineLastOutcome(item)}`)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {new Date(item.dueAt).toLocaleString(locale)}
              </Text>
              {routineDelayMinutes(item) !== null ? (
                <Text className="text-sm text-foreground">
                  {t("routines.startedLate", { minutes: routineDelayMinutes(item)! })}
                </Text>
              ) : null}
              {item.runId && item.conversationId && onOpenRun ? (
                <Action
                  label={t("routines.openRun")}
                  secondary
                  onPress={() => onOpenRun(item.conversationId!, item.runId!)}
                />
              ) : null}
            </View>
          )}
        />
      </CapabilityLayout>
    );
  return (
    <CapabilityLayout title={title} scroll={false}>
      {feedback}
      <View className="flex-row flex-wrap gap-2">
        <Action label={t("routines.newRoutine")} onPress={() => controller.edit(null)} />
        <Action
          label={t("routines.refresh")}
          secondary
          busy={state.loading}
          onPress={() => void controller.refresh()}
        />
        <Action label={t("agents.back")} secondary onPress={onBack} />
      </View>
      <FlatList
        accessibilityLabel={t("routines.title")}
        data={state.routines}
        keyExtractor={(routine) => routine.id}
        refreshing={state.loading}
        onRefresh={() => void controller.refresh()}
        ListEmptyComponent={
          !state.loading ? (
            <Text className="text-base text-muted-foreground">{t("routines.empty")}</Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <View className="gap-2 border-b border-border py-3">
            <Text className="text-lg font-semibold text-foreground">{item.name}</Text>
            <Text className="text-sm text-muted-foreground">
              {t(item.enabled ? "routines.enabled" : "routines.paused")}
            </Text>
            {item.triggers.schedule ? (
              <Text className="text-sm text-muted-foreground">
                {item.triggers.schedule.cron} · {item.triggers.schedule.timezone}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              <Action
                label={`${t("routines.edit")}: ${item.name}`}
                secondary
                disabled={state.busy}
                onPress={() => controller.edit(item)}
              />
              <Action
                label={`${t("routines.runNow")}: ${item.name}`}
                secondary
                disabled={state.busy || !item.enabled}
                onPress={() => void controller.run(item)}
              />
              <Action
                label={`${t("routines.history")}: ${item.name}`}
                secondary
                disabled={state.busy}
                onPress={() => void controller.openHistory(item)}
              />
              <Action
                label={`${t(item.enabled ? "routines.pause" : "routines.resume")}: ${item.name}`}
                secondary
                disabled={state.busy}
                onPress={() => void controller.toggle(item)}
              />
            </View>
          </View>
        )}
      />
    </CapabilityLayout>
  );
}
