import { continueTaskFailure, followUpPlan, taskSelection } from "../model/composition.ts";
import { ModelPicker } from "./model-picker.tsx";
import type { AgentTask, ModelSelection } from "@raypx/core/tasks";
import { useConfirmation } from "@raypx/ui/confirmation";
import { agentProviderMetadata } from "@raypx/core/tasks";
import { Approval } from "./approval.tsx";

import { ContextSnapshot } from "@raypx/memory/client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { TaskWorkspacePort } from "../model/port.ts";
import type { SequencedEvent, SyncDevice } from "@raypx/contracts/tasks";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { Badge } from "@raypx/ui/components/ui/badge";

import { Field, FieldLabel } from "@raypx/ui/components/ui/field";

import { Textarea } from "@raypx/ui/components/ui/textarea";
import { isTaskActive } from "../model/task.ts";

import { failureCode } from "../model/failure.ts";
import { Conversation } from "./conversation.tsx";
import { TaskInputComposer } from "./task-input.tsx";

import { TaskMarkdown } from "./markdown.tsx";
import { useTaskConversation } from "./use-task-conversation.ts";
import { isLocalWorkspace, workspaceScopeKey, type WorkspaceScope } from "../model/scope.ts";
import { useSessionDraft } from "./use-session-draft.ts";
import { submitShortcut } from "./submit-shortcut.ts";

function taskStatusVariant(status: AgentTask["status"]) {
  if (status === "waiting") return "default";
  if (status === "failed" || status === "interrupted" || status === "delivery_failed")
    return "destructive";
  return "secondary";
}

interface TaskDetailProps {
  client: TaskWorkspacePort;
  id: string;
  devices: SyncDevice[];
  onChanged: () => void;
  scope: WorkspaceScope;
  target?: { projectId: string; deviceId?: string | undefined } | undefined;
  onFollowUp?: ((id: string) => void) | undefined;
}

export function TaskDetail(props: TaskDetailProps) {
  return (
    <TaskDetailView key={JSON.stringify([workspaceScopeKey(props.scope), props.id])} {...props} />
  );
}

function TaskDetailView({
  devices,
  client,
  id,
  onChanged,
  scope,
  target,
  onFollowUp,
}: TaskDetailProps) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const format = useFormatter();
  const followField = useId();
  const local = isLocalWorkspace(scope);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof failureCode>>();
  const { confirm, dialog } = useConfirmation();
  const [changedModel, setModel] = useState<ModelSelection>();
  const [modelReady, setModelReady] = useState(false);
  const [modelPending, setModelPending] = useState(true);
  const active = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { data, error, errorCode, refresh, loadingOlder, loadGap, loadOlder } = useTaskConversation(
    client,
    id,
    scope,
    setFailure,
  );
  const draft = useSessionDraft(scope, data?.task, id, "followUp");
  const prompt = draft.prompt;
  const model = changedModel ?? draft.model ?? data?.task.model;
  const requiresModel = data
    ? taskSelection(devices, data.task.deviceId, data.task.projectId, data.task.provider)
        .requiresModel
    : false;
  const continuationFailure = data
    ? continueTaskFailure(data.task, data.continuation, devices, modelReady, model)
    : undefined;
  const continuationHint =
    continuationFailure === "AI_MODEL_NOT_FOUND" && modelPending && local && client.models
      ? "modelChecking"
      : continuationFailure;
  const canContinue = Boolean(data && !continuationFailure && draft.ready);
  async function cancel() {
    if (active.current) return;
    active.current = true;
    setFailure(undefined);
    setBusy(true);
    try {
      await client.tasks.cancel({ id }, { signal: AbortSignal.timeout(15_000) });
      if (!mounted.current) return;
      refresh();
      onChanged();
    } catch (e) {
      if (mounted.current) setFailure(failureCode(e));
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function follow(event: FormEvent) {
    event.preventDefault();
    if (active.current || !prompt.trim() || !canContinue) return;
    active.current = true;
    setFailure(undefined);
    setBusy(true);
    try {
      let delivery = draft.delivery?.kind === "followUp" ? draft.delivery : undefined;
      if (!delivery) {
        const selected = model;
        const context = data?.continuation;
        if (requiresModel && (!selected || !context)) throw new Error("SESSION_UNAVAILABLE");
        const plan = followUpPlan(crypto.randomUUID(), id, prompt.trim(), selected, context);
        const transfer = plan.transfer;
        if (
          transfer &&
          !(await confirm({
            title: t("contextTransfer"),
            description: t("contextTransferHint"),
            confirmLabel: t("contextTransferConfirm"),
            cancelLabel: c("cancel"),
          }))
        )
          return;
        if (!mounted.current) return;
        delivery = { kind: "followUp", input: plan.input };
        draft.remember(delivery);
      }
      const task = await client.tasks.followUp(delivery.input, {
        signal: AbortSignal.timeout(15_000),
      });
      draft.accepted(delivery);
      if (!mounted.current) return;
      onChanged();
      onFollowUp?.(task.id);
    } catch (e) {
      if (mounted.current) setFailure(failureCode(e));
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (!data) {
    const message = local && errorCode !== "UPGRADE_REQUIRED" ? "LOCAL_UNAVAILABLE" : errorCode;
    return (
      <div className="space-y-3">
        <p role={error ? "alert" : "status"}>{error ? t(message) : c("loading")}</p>
        {error && (
          <Button variant="outline" onClick={refresh}>
            {c("retry")}
          </Button>
        )}
      </div>
    );
  }
  if (
    target &&
    (data.task.projectId !== target.projectId ||
      (target.deviceId && data.task.deviceId !== target.deviceId))
  )
    return (
      <p role="alert" className="text-sm text-destructive-text">
        {t("sessionOutsideProject")}
      </p>
    );
  function eventLabel(event: SequencedEvent["event"]) {
    if (event.kind === "status") return t(event.status);
    if (event.kind === "request") return event.request.title;
    return t("applied");
  }
  return (
    <div className="space-y-5">
      {dialog}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-3">
          <Badge variant={taskStatusVariant(data.task.status)}>{t(data.task.status)}</Badge>
          <h2 className="line-clamp-3 text-xl leading-snug font-semibold [overflow-wrap:anywhere]">
            {data.task.prompt}
          </h2>
        </div>
        {isTaskActive(data.task) && (
          <Button
            variant="outline"
            disabled={busy || data.task.status === "cancelling"}
            onClick={() => void cancel()}
          >
            {c("cancel")}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-5 text-xs text-muted-foreground">
        <span>{agentProviderMetadata[data.task.provider].label}</span>
        <span>{devices.find((device) => device.id === data.task.deviceId)?.name}</span>
        <span>
          {
            devices
              .find((device) => device.id === data.task.deviceId)
              ?.projects.find((project) => project.id === data.task.projectId)?.name
          }
        </span>
        <time dateTime={data.task.updatedAt}>
          {format.dateTime(new Date(data.task.updatedAt), "timestamp")}
        </time>
      </div>
      {data.task.context && <ContextSnapshot snapshot={data.task.context} />}
      {data.requests.map((request) => (
        <Approval
          key={request.id}
          client={client}
          request={request}
          onChanged={() => {
            refresh();
            onChanged();
          }}
        />
      ))}
      {data.task.activityIncomplete && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("snapshotIncomplete")}
        </p>
      )}
      {data.continuation?.blocked && (
        <p role="alert" className="text-sm text-destructive-text">
          {t("PI_RECOVERY_REQUIRED")}
        </p>
      )}
      {!isTaskActive(data.task) && (
        <section aria-label={t("taskResult")} className="space-y-3 border-b border-border pb-5">
          <h3 className="text-sm font-semibold">
            {t(data.task.status === "succeeded" ? "taskResult" : "failureDetails")}
          </h3>
          {data.task.summary ? (
            <TaskMarkdown>{data.task.summary}</TaskMarkdown>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noTaskResult")}</p>
          )}
        </section>
      )}
      <TaskConversationPanel
        task={data.task}
        entries={data.activity}
        gaps={data.activityGaps}
        loadGap={loadGap}
        more={data.activityBefore !== undefined}
        loading={loadingOlder}
        loadOlder={loadOlder}
      />
      {isTaskActive(data.task) && (
        <TaskInputComposer
          client={client}
          scope={scope}
          task={data.task}
          entries={data.activity}
          modes={
            devices
              .find((device) => device.id === data.task.deviceId)
              ?.capabilities.find((capability) => capability.provider === data.task.provider)
              ?.inputModes ?? []
          }
          waiting={data.requests.some((request) => ["pending", "decided"].includes(request.status))}
          onChanged={refresh}
        />
      )}
      <Collapsible>
        <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="group" />}>
          <ChevronRightIcon aria-hidden="true" className="group-data-panel-open:rotate-90" />
          {t("activity")}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
            {data.events.map(({ cursor: eventCursor, event }) => (
              <li key={eventCursor}>{eventLabel(event)}</li>
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>
      {data.task.model && (
        <p className="text-xs text-muted-foreground">
          {data.task.model.provider} · {data.task.model.model}
        </p>
      )}
      {!isTaskActive(data.task) && (
        <form onSubmit={(event) => void follow(event)} className="space-y-3">
          <Field>
            <FieldLabel htmlFor={followField}>{t("followUp")}</FieldLabel>
            <Textarea
              id={followField}
              className="min-h-24"
              required
              maxLength={32000}
              value={prompt}
              disabled={busy || !draft.ready}
              onChange={(event) => draft.edit(event.target.value, model)}
              onKeyDown={submitShortcut}
            />
          </Field>
          {requiresModel && local && client.models && (
            <ModelPicker
              client={client.models}
              value={model}
              onReady={setModelReady}
              onPending={setModelPending}
              disabled={busy}
              onChange={(value) => {
                setModel(value);
                draft.edit(prompt, value);
              }}
            />
          )}
          {continuationHint && continuationHint !== "PI_RECOVERY_REQUIRED" && (
            <p role="status" className="text-sm text-muted-foreground">
              {t(continuationHint)}
            </p>
          )}
          <Button type="submit" disabled={busy || !prompt.trim() || !canContinue}>
            {t("send")}
          </Button>
        </form>
      )}
      {draft.failure && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(draft.failure)}
        </p>
      )}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {t(failure)}
        </p>
      )}
    </div>
  );
}

/** Preserve a live reader when completion adds the result above their conversation. */
function TaskConversationPanel(props: Parameters<typeof Conversation>[0]) {
  const t = useTranslations("tasks");
  const active = isTaskActive(props.task);
  const [expanded, setExpanded] = useState(active);
  const [mounted, setMounted] = useState(active);
  return (
    <Collapsible
      open={active || expanded}
      onOpenChange={(open) => {
        setExpanded(open);
        if (open) setMounted(true);
      }}
    >
      {!active && (
        <CollapsibleTrigger
          render={<Button type="button" variant="ghost" size="sm" className="group" />}
        >
          <ChevronRightIcon aria-hidden="true" className="group-data-panel-open:rotate-90" />
          {t("viewConversation")}
        </CollapsibleTrigger>
      )}
      <CollapsibleContent keepMounted={mounted} className={active ? undefined : "pt-3"}>
        <Conversation {...props} showSummary={active} />
      </CollapsibleContent>
    </Collapsible>
  );
}
