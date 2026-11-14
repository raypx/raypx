import { useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { ProtectedInputsController, type ProtectedInputsPort } from "../model/protected-input.js";
import type { ProtectedInputRequest } from "@raypx/core/protected-input";
import type { SpaceId } from "@raypx/core/spaces";
import { useTranslations } from "./i18n.js";

function ProtectedInputForm({
  request,
  controller,
  busy,
}: {
  request: ProtectedInputRequest;
  controller: ProtectedInputsController;
  busy: boolean;
}) {
  const t = useTranslations("agents");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const clear = () => {
      if (input.current) input.current.value = "";
    };
    const hidden = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clear();
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  return (
    <form
      data-protected-input
      className="flex min-w-0 flex-col gap-2 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const value = input.current?.value ?? "";
        if (input.current) input.current.value = "";
        if (value && !busy) void controller.answer(request.id, { decision: "answer", value });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id}>
            {t("protectedInput.title", { name: request.input.name })}
          </FieldLabel>
          <p className="text-xs text-muted-foreground" id={`${id}-purpose`}>
            {request.input.purpose}
          </p>
          <p className="break-all text-xs text-muted-foreground">
            {request.toolName} · {request.target}
          </p>
          <p className="text-xs text-muted-foreground">
            {request.input.destination.kind === "environment"
              ? t("protectedInput.environment", { variable: request.input.destination.variable })
              : t("protectedInput.http")}
          </p>
          {request.untrustedInput && (
            <p role="note" className="text-sm">
              {t("protectedInput.untrusted", {
                source: request.provenanceKind ?? t("protectedInput.external"),
              })}
            </p>
          )}
          {request.state === "pending" ? (
            <Input
              ref={input}
              id={id}
              type="password"
              autoComplete="off"
              required
              maxLength={4096}
              disabled={busy}
              aria-describedby={`${id}-purpose ${id}-privacy`}
            />
          ) : (
            <p role="status">{t("protectedInput.answered")}</p>
          )}
          <p className="text-xs text-muted-foreground" id={`${id}-privacy`}>
            {t("protectedInput.privacy")}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {t("protectedInput.expires", {
              time: new Date(request.expiresAt).toLocaleTimeString(),
            })}
          </p>
        </Field>
      </FieldGroup>
      {request.state === "pending" && (
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {t("protectedInput.submit")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (input.current) input.current.value = "";
              void controller.answer(request.id, { decision: "decline" });
            }}
          >
            {t("protectedInput.decline")}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Independent of loaded conversation history; no secret enters workspace drafts. */
export function ProtectedInputs({
  port,
  spaceId,
  conversationId,
}: {
  port: ProtectedInputsPort;
  spaceId: SpaceId;
  conversationId?: string | undefined;
}) {
  const t = useTranslations("agents");
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
      if (!document.hidden) void controller.refresh();
    }, 2000);
    const refresh = () => {
      if (!document.hidden) void controller.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      controller.dispose();
    };
  }, [controller]);
  return (
    <div
      className="flex max-h-80 shrink-0 flex-col gap-2 overflow-y-auto"
      aria-label={t("protectedInput.requests")}
    >
      {state.requests
        .filter((r) => !conversationId || r.conversationId === conversationId)
        .map((request) => (
          <ProtectedInputForm
            key={request.id}
            request={request}
            controller={controller}
            busy={state.busy !== null}
          />
        ))}
      {state.error && (
        <p role="alert" className="text-sm">
          {t("protectedInput.error")}
        </p>
      )}
    </div>
  );
}
