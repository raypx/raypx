import { messageKey } from "./ports.js";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Image, Text, View } from "react-native";
import type { AttachmentsController, MessageAttachmentsPort } from "@raypx/agents/model";
import type { MessageAttachment } from "@raypx/core/conversation";
import type { ConversationId } from "@raypx/core/agents";
import type { SpaceId } from "@raypx/core/spaces";
import { Action } from "../ui.js";
import { useCopy } from "../locale.js";
const empty: readonly import("@raypx/agents/model").AttachmentDraft[] = [];
const none = () => empty;
const noSubscribe = () => () => {};
export function useAttachmentDrafts(controller: AttachmentsController | undefined) {
  return useSyncExternalStore(
    controller?.subscribe ?? noSubscribe,
    controller?.getSnapshot ?? none,
    none,
  );
}
export function AttachmentPicker({
  controller,
  supportsImages,
  disabled,
}: {
  controller: AttachmentsController | undefined;
  supportsImages: boolean;
  disabled: boolean;
}) {
  const { t } = useCopy();
  const items = useAttachmentDrafts(controller);
  const [error, setError] = useState(false);
  async function pick(photo: boolean) {
    if (!controller || disabled) return;
    setError(false);
    try {
      if (photo) {
        const picker = await import("expo-image-picker");
        const result = await picker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: 4,
          base64: true,
          preferredAssetRepresentationMode:
            picker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        });
        if (!result.canceled)
          for (const asset of result.assets) {
            if (!asset.base64) {
              setError(true);
              continue;
            }
            await controller.add({
              name: `${asset.fileName?.replace(/\.[^.]+$/, "") ?? "photo"}.jpg`,
              mediaType: "image/jpeg",
              size:
                (asset.base64.length / 4) * 3 -
                (asset.base64.endsWith("==") ? 2 : Number(asset.base64.endsWith("="))),
              read: async () => asset.base64!,
            });
          }
      } else {
        const picker = await import("expo-document-picker");
        const result = await picker.getDocumentAsync({
          multiple: true,
          copyToCacheDirectory: true,
          type: ["text/plain", "text/markdown", "text/csv", "application/json", "application/pdf"],
        });
        if (!result.canceled)
          for (const asset of result.assets) {
            const { File, Paths } = await import("expo-file-system");
            const file = new File(asset.uri);
            try {
              await controller.add({
                name: asset.name,
                mediaType: asset.mimeType ?? "text/plain",
                size: asset.size ?? file.size,
                read: () => file.base64(),
              });
            } finally {
              if (file.uri.startsWith(Paths.cache.uri) && file.exists) file.delete();
            }
          }
      }
    } catch {
      setError(true);
    }
  }
  if (!controller) return null;
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        <Action
          label={t("agents.attachments.add")}
          secondary
          disabled={disabled || items.length >= 4}
          onPress={() => void pick(false)}
        />
        <Action
          label={t("agents.attachments.images")}
          secondary
          disabled={disabled || !supportsImages || items.length >= 4}
          onPress={() => void pick(true)}
        />
      </View>
      {!supportsImages && (
        <Text className="text-xs text-muted-foreground">
          {t("agents.attachments.imagesUnavailable")}
        </Text>
      )}
      {items.map((item) => (
        <View
          key={item.key}
          className="flex-row flex-wrap items-center gap-2 rounded-lg border border-border px-2 py-1"
        >
          <Text className="shrink text-sm text-foreground">{item.name}</Text>
          {item.state === "uploading" && (
            <Text accessibilityLiveRegion="polite" className="text-xs text-muted-foreground">
              {t("agents.attachments.uploading")}
            </Text>
          )}
          {item.error && (
            <Text accessibilityRole="alert" className="text-xs text-foreground">
              {t(`agents.attachments.${item.error}`)}
            </Text>
          )}
          <Action
            label={t("agents.attachments.remove", { name: item.name })}
            secondary
            disabled={disabled}
            onPress={() => controller.remove(item.key)}
          />
        </View>
      ))}
      {error && (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t("agents.attachments.upload")}
        </Text>
      )}
    </View>
  );
}
export function AttachmentDownloads({
  attachments,
  port,
  spaceId,
  conversationId,
}: {
  attachments: readonly MessageAttachment[] | undefined;
  port: MessageAttachmentsPort | undefined;
  spaceId: SpaceId;
  conversationId: ConversationId;
}) {
  const { t } = useCopy();
  const [error, setError] = useState(false);
  async function download(attachment: MessageAttachment) {
    if (!port) return;
    setError(false);
    try {
      const result = await port.download({ spaceId, conversationId, id: attachment.id });
      const [{ File, Paths }, sharing] = await Promise.all([
        import("expo-file-system"),
        import("expo-sharing"),
      ]);
      const file = new File(Paths.cache, `${messageKey()}-${result.attachment.name}`);
      try {
        file.create();
        await file.write(
          Uint8Array.from(atob(result.bytes), (character) => character.charCodeAt(0)),
        );
        await sharing.shareAsync(file.uri, { mimeType: result.attachment.mediaType });
      } finally {
        if (file.exists) file.delete();
      }
    } catch {
      setError(true);
    }
  }
  return (
    <View className="gap-1">
      {attachments?.map((attachment) => (
        <View key={attachment.id} className="gap-1">
          <AttachmentThumbnail
            attachment={attachment}
            port={port}
            spaceId={spaceId}
            conversationId={conversationId}
          />
          <Action
            label={t("agents.attachments.download", { name: attachment.name })}
            secondary
            disabled={!port}
            onPress={() => void download(attachment)}
          />
          <Text className="text-xs text-muted-foreground">
            {attachment.mediaType === "application/pdf"
              ? "PDF"
              : t(
                  attachment.mediaType.startsWith("image/")
                    ? "agents.attachments.image"
                    : "agents.attachments.document",
                )}{" "}
            · {Math.ceil(attachment.size / 1024)} KiB
          </Text>
          {attachment.deliveries
            ?.filter((delivery) => delivery.state === "withheld")
            .map((delivery) => (
              <Text key={delivery.runId} className="text-xs text-muted-foreground">
                {t(`agents.attachments.${delivery.reason ?? "COMPUTER_UNAVAILABLE"}`)}
              </Text>
            ))}
        </View>
      ))}
      {error && (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t("agents.attachments.downloadError")}
        </Text>
      )}
    </View>
  );
}

function AttachmentThumbnail({
  attachment,
  port,
  spaceId,
  conversationId,
}: {
  attachment: MessageAttachment;
  port: MessageAttachmentsPort | undefined;
  spaceId: SpaceId;
  conversationId: ConversationId;
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!port || !attachment.mediaType.startsWith("image/")) return;
    let current = true;
    void port
      .download({ spaceId, conversationId, id: attachment.id })
      .then((result) => {
        if (current) setUri(`data:${attachment.mediaType};base64,${result.bytes}`);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [port, spaceId, conversationId, attachment.id, attachment.mediaType]);
  return uri ? (
    <Image
      source={{ uri }}
      accessibilityLabel={attachment.name}
      className="size-20 rounded-xl"
      resizeMode="cover"
      onError={() => setUri(null)}
    />
  ) : null;
}
