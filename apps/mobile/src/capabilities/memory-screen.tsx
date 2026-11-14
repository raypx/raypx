import { useState, useSyncExternalStore } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { Spinner } from "heroui-native/spinner";
import { MAX_MEMORY_TEXT } from "@raypx/core/space-memory";
import { useCopy } from "../locale.js";
import { Action } from "../ui.js";
import { ReplyMarkdown } from "../agents/markdown.js";
import { CapabilityField, CapabilityLayout, CapabilityToggle } from "./layout.js";
import type { MobileMemoryController } from "./memory-controller.js";

export function MobileMemoryScreen({
  controller,
  agentName,
  onBack,
}: {
  controller: MobileMemoryController;
  agentName: string;
  onBack(this: void): void;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { t } = useCopy();
  const [preview, setPreview] = useState(false);
  const [revisionPreview, setRevisionPreview] = useState<number | null>(null);
  const title = t("mobile-capabilities.memoryAgent", { name: agentName });
  const feedback = (
    <>
      {state.loading ? <Spinner accessibilityLabel={t("memory.space.loading")} /> : null}
      {state.error ? (
        <Text accessibilityRole="alert" className="text-base text-foreground">
          {t(state.editor?.conflict ? "memory.space.MEMORY_CONFLICT" : "memory.space.UNAVAILABLE")}
        </Text>
      ) : null}
    </>
  );
  if (state.editor) {
    const { draft, current } = state.editor;
    return (
      <CapabilityLayout title={title}>
        {feedback}
        {current?.provenance.untrustedInput ? (
          <Text className="text-sm text-foreground">{t("memory.space.untrusted")}</Text>
        ) : null}
        {current ? (
          <Text className="text-sm text-muted-foreground">
            {t("memory.space.revision", { revision: current.revision })} ·{" "}
            {t(
              current.provenance.kind === "member"
                ? "memory.space.member"
                : "memory.space.agentSaved",
            )}
            {current.removed ? ` · ${t("memory.space.removed")}` : ""}
          </Text>
        ) : null}
        <CapabilityField
          label={t("memory.space.documentTitle")}
          value={draft.title}
          disabled={state.busy || Boolean(current?.removed)}
          maxLength={200}
          onChange={(value) => controller.change({ title: value })}
        />
        <CapabilityToggle
          label={t("memory.space.space")}
          value={draft.scope === "space"}
          disabled={state.busy || Boolean(current?.removed)}
          onChange={(shared) =>
            controller.change({
              scope: shared ? "space" : "agent",
              agentId: shared ? null : controller.agentId,
            })
          }
        />
        <CapabilityToggle
          label={t("memory.space.pinned")}
          value={draft.pinned}
          disabled={state.busy || Boolean(current?.removed)}
          onChange={(pinned) => controller.change({ pinned })}
        />
        <CapabilityToggle label={t("memory.space.preview")} value={preview} onChange={setPreview} />
        {preview ? (
          <ReplyMarkdown text={draft.text} />
        ) : (
          <CapabilityField
            label={t("memory.space.source")}
            value={draft.text}
            maxLength={MAX_MEMORY_TEXT}
            multiline
            disabled={state.busy || Boolean(current?.removed)}
            onChange={(text) => controller.change({ text })}
          />
        )}
        {state.editor.conflict ? (
          <>
            <Text className="text-sm text-foreground">{t("memory.space.draftKept")}</Text>
            <Action
              label={t("memory.space.reload")}
              secondary
              busy={state.busy}
              onPress={() => void controller.reload()}
            />
          </>
        ) : null}
        <Action
          label={t("agents.save")}
          busy={state.busy}
          disabled={Boolean(current?.removed) || state.editor.conflict || !draft.title.trim()}
          onPress={() => void controller.save()}
        />
        {current && !current.removed ? (
          <Action
            label={t("memory.space.remove")}
            secondary
            disabled={state.busy}
            onPress={() =>
              Alert.alert(t("mobile-capabilities.removeConfirm"), t("memory.space.removeHint"), [
                { text: t("agents.cancel"), style: "cancel" },
                {
                  text: t("memory.space.remove"),
                  style: "destructive",
                  onPress: () => void controller.remove(),
                },
              ])
            }
          />
        ) : null}
        {current ? (
          <>
            <Text accessibilityRole="header" className="text-lg text-foreground">
              {t("memory.space.history")}
            </Text>
            {!state.revisions.length ? (
              <Text className="text-sm text-muted-foreground">{t("memory.space.noRevisions")}</Text>
            ) : null}
            {state.revisions.map((revision) => (
              <View key={revision.revision} className="gap-2 border-t border-border pt-3">
                <Action
                  label={t("memory.space.revision", { revision: revision.revision })}
                  secondary
                  onPress={() =>
                    setRevisionPreview(
                      revisionPreview === revision.revision ? null : revision.revision,
                    )
                  }
                />
                {revisionPreview === revision.revision ? (
                  <View className="gap-2">
                    <Text className="text-base font-semibold text-foreground">
                      {revision.title}
                    </Text>
                    <ReplyMarkdown text={revision.text ?? ""} />
                    {revision.provenance.untrustedInput ? (
                      <Text className="text-sm text-foreground">{t("memory.space.untrusted")}</Text>
                    ) : null}
                  </View>
                ) : null}
                <Action
                  label={t("memory.space.restore", { revision: revision.revision })}
                  secondary
                  disabled={state.busy || revision.revision === current.revision}
                  onPress={() =>
                    Alert.alert(
                      t("mobile-capabilities.restoreConfirm"),
                      t("memory.space.restoreHint"),
                      [
                        { text: t("agents.cancel"), style: "cancel" },
                        {
                          text: t("memory.space.restoreConfirm"),
                          onPress: () => void controller.restore(revision),
                        },
                      ],
                    )
                  }
                />
              </View>
            ))}
          </>
        ) : null}
        <Action
          label={t("mobile-capabilities.backToList")}
          secondary
          disabled={state.busy}
          onPress={() => {
            controller.close();
            setPreview(false);
            setRevisionPreview(null);
          }}
        />
      </CapabilityLayout>
    );
  }
  return (
    <CapabilityLayout title={title} scroll={false}>
      {feedback}
      <View className="flex-row flex-wrap gap-2">
        <Action label={t("memory.space.create")} onPress={() => void controller.edit(null)} />
        <Action
          label={t("agents.refresh")}
          secondary
          busy={state.loading}
          onPress={() => void controller.refresh()}
        />
        <Action label={t("agents.back")} secondary onPress={onBack} />
      </View>
      <FlatList
        accessibilityLabel={t("memory.space.title")}
        data={state.documents}
        keyExtractor={(document) => document.id}
        refreshing={state.loading}
        onRefresh={() => void controller.refresh()}
        ListEmptyComponent={
          !state.loading ? (
            <Text className="text-base text-muted-foreground">{t("memory.space.empty")}</Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <View className="gap-2 border-b border-border py-3">
            <Text className="text-lg font-semibold text-foreground">{item.title}</Text>
            <Text className="text-sm text-muted-foreground">
              {t(
                item.scope === "space" ? "mobile-capabilities.shared" : "mobile-capabilities.agent",
              )}{" "}
              · {t("memory.space.revision", { revision: item.revision })}
              {item.removed ? ` · ${t("memory.space.removed")}` : ""}
            </Text>
            {item.provenance.untrustedInput ? (
              <Text className="text-sm text-foreground">{t("memory.space.untrusted")}</Text>
            ) : null}
            <Action
              label={t("memory.space.editNamed", { title: item.title })}
              secondary
              onPress={() => void controller.edit(item)}
            />
          </View>
        )}
      />
    </CapabilityLayout>
  );
}
