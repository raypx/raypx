import { type ComponentRef, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { AppState, Text, View } from "react-native";
import { Input } from "heroui-native/input";
import { Label } from "heroui-native/label";
import { TextField } from "heroui-native/text-field";
import { ProtectedInputsController, type ProtectedInputsPort } from "@raypx/agents/model";
import type { ProtectedInputRequest } from "@raypx/core/protected-input";
import type { SpaceId } from "@raypx/core/spaces";
import { Action } from "../ui.js";
import { useCopy } from "../locale.js";

function ProtectedInputForm({
  request,
  controller,
  busy,
}: {
  request: ProtectedInputRequest;
  controller: ProtectedInputsController;
  busy: boolean;
}) {
  const { t } = useCopy();
  const input = useRef<ComponentRef<typeof Input>>(null);
  const value = useRef("");
  function clear() {
    value.current = "";
    input.current?.clear();
  }
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") clear();
    });
    return () => {
      clear();
      listener.remove();
    };
  }, []);
  return (
    <View className="gap-3 rounded-lg border border-border p-4">
      <TextField>
        <Label>{t("agents.protectedInput.title", { name: request.input.name })}</Label>
        <Text className="text-sm text-foreground">{request.input.purpose}</Text>
        <Text className="text-xs text-muted-foreground">
          {request.toolName} · {request.target}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {request.input.destination.kind === "environment"
            ? t("agents.protectedInput.environment", {
                variable: request.input.destination.variable,
              })
            : t("agents.protectedInput.http")}
        </Text>
        {request.untrustedInput && (
          <Text className="text-sm text-foreground">
            {t("agents.protectedInput.untrusted", {
              source: request.provenanceKind ?? t("agents.protectedInput.external"),
            })}
          </Text>
        )}
        {request.state === "pending" ? (
          <Input
            ref={input}
            accessibilityLabel={t("agents.protectedInput.title", { name: request.input.name })}
            secureTextEntry
            autoComplete="off"
            maxLength={4096}
            editable={!busy}
            onChangeText={(text) => {
              value.current = text;
            }}
          />
        ) : (
          <Text accessibilityRole="text">{t("agents.protectedInput.answered")}</Text>
        )}
      </TextField>
      <Text className="text-xs text-muted-foreground">{t("agents.protectedInput.privacy")}</Text>
      <Text className="text-xs text-muted-foreground">
        {t("agents.protectedInput.expires", {
          time: new Date(request.expiresAt).toLocaleTimeString(),
        })}
      </Text>
      {request.state === "pending" && (
        <View className="flex-row gap-2">
          <Action
            label={t("agents.protectedInput.submit")}
            disabled={busy}
            onPress={() => {
              const supplied = value.current;
              clear();
              if (supplied)
                void controller.answer(request.id, { decision: "answer", value: supplied });
            }}
          />
          <Action
            label={t("agents.protectedInput.decline")}
            disabled={busy}
            secondary
            onPress={() => {
              clear();
              void controller.answer(request.id, { decision: "decline" });
            }}
          />
        </View>
      )}
    </View>
  );
}

export function ProtectedInputs({
  port,
  spaceId,
  conversationId,
}: {
  port: ProtectedInputsPort;
  spaceId: SpaceId;
  conversationId: string;
}) {
  const { t } = useCopy();
  const controller = useMemo(() => new ProtectedInputsController(port, spaceId), [port, spaceId]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.activate();
    void controller.refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void controller.refresh();
    }, 2000);
    const listener = AppState.addEventListener("change", (next) => {
      if (next === "active") void controller.refresh();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
      controller.dispose();
    };
  }, [controller]);
  const requests = state.requests.filter((r) => r.conversationId === conversationId);
  if (!requests.length && !state.error) return null;
  return (
    <View className="gap-2">
      {requests.map((request) => (
        <ProtectedInputForm
          key={request.id}
          request={request}
          controller={controller}
          busy={state.busy !== null}
        />
      ))}
      {state.error && (
        <Text accessibilityRole="alert" className="text-sm text-foreground">
          {t("agents.protectedInput.error")}
        </Text>
      )}
    </View>
  );
}
