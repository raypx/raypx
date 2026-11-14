import { useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { cn } from "@raypx/ui/lib/utils";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { toolDisplayLabel } from "../model/tool-label.js";
import { useLocale } from "@raypx/i18n/browser";
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
  const locale = useLocale();
  const id = useId();
  const destination = request.input.destination;
  const provenanceKind = (["routine", "webhook", "email", "repository", "agent"] as const).find(
    (kind) => kind === request.provenanceKind,
  );
  function destinationText() {
    switch (destination.kind) {
      case "environment":
        return t("protectedInput.environment", { variable: destination.variable });
      case "stdin":
        return t("protectedInput.stdin");
      case "http-bearer":
        return t("protectedInput.http");
      case "http-api-key":
        return t("protectedInput.apiKey", { location: destination.in, name: destination.name });
      case "http-basic":
        return t("protectedInput.basic");
      case "mcp-header":
        return t("protectedInput.mcpHeader", { name: destination.name });
    }
  }
  const destinationLabel = destinationText();
  const input = useRef<HTMLInputElement>(null);
  const username = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const field = input.current;
    const userField = username.current;
    const clear = () => {
      if (field) field.value = "";
      if (userField) userField.value = "";
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
      className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const password = input.current?.value ?? "";
        const user = username.current?.value ?? "";
        const value =
          destination.kind === "http-basic"
            ? user && password
              ? `${user}:${password}`
              : ""
            : password;
        if (username.current) username.current.value = "";
        if (input.current) input.current.value = "";
        if (value && !busy) void controller.answer(request.id, { decision: "answer", value });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id}>
            <ShieldCheckIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            {t("protectedInput.title", { name: request.input.name })}
          </FieldLabel>
          <p className="text-xs text-muted-foreground wrap-anywhere" id={`${id}-purpose`}>
            {request.input.purpose}
          </p>
          <p className="break-all text-xs text-muted-foreground">
            {toolDisplayLabel(request.toolName, t)} · {request.target}
          </p>
          <p className="text-xs text-muted-foreground">{destinationLabel}</p>
          {request.untrustedInput && (
            <p role="note" className="text-sm">
              {t("protectedInput.untrusted", {
                source: provenanceKind
                  ? t(`origins.${provenanceKind}`)
                  : t("protectedInput.external"),
              })}
            </p>
          )}
          {request.state === "pending" && destination.kind === "http-basic" && (
            <Field>
              <FieldLabel htmlFor={`${id}-username`}>{t("protectedInput.username")}</FieldLabel>
              <Input
                ref={username}
                id={`${id}-username`}
                type="password"
                autoComplete="off"
                required
                maxLength={1024}
                disabled={busy}
                pattern="[^:]+"
              />
            </Field>
          )}
          {request.state === "pending" ? (
            <Input
              ref={input}
              id={id}
              type="password"
              autoComplete="off"
              required
              maxLength={destination.kind === "http-basic" ? 3071 : 4096}
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
              time: new Date(request.expiresAt).toLocaleTimeString(locale),
            })}
          </p>
        </Field>
      </FieldGroup>
      {request.state === "pending" && (
        <div className="flex flex-wrap gap-2">
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
              if (username.current) username.current.value = "";
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
  className,
}: {
  port: ProtectedInputsPort;
  spaceId: SpaceId;
  conversationId?: string | undefined;
  className?: string | undefined;
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
      className={cn(
        "flex max-h-[min(24rem,45dvh)] min-w-0 shrink-0 flex-col gap-2 overflow-y-auto empty:hidden",
        className,
      )}
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
        <div
          role="alert"
          className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3"
        >
          <p className="min-w-0 flex-1 text-sm">{t("protectedInput.error")}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={state.busy !== null}
            onClick={() => void controller.refresh()}
          >
            {t("refresh")}
          </Button>
        </div>
      )}
    </div>
  );
}
