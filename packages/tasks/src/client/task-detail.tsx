import { Approval } from "./approval.js";

import { ContextSnapshot } from "@raypx/memory/client";
import { useId, useRef, useState, type FormEvent } from "react";
import { type TaskWorkspaceClient } from "./remote-query.js";
import type { SyncDevice } from "@raypx/contracts/tasks";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { Badge } from "@raypx/ui/components/ui/badge";

import { Field, FieldLabel } from "@raypx/ui/components/ui/field";

import { Textarea } from "@raypx/ui/components/ui/textarea";
import { isTaskActive } from "../index.js";

import { failureCode } from "./failure.js";
import { Conversation } from "./conversation.js";
import { TaskInputComposer } from "./task-input.js";

import { TaskMarkdown } from "./markdown.js";
import { useTaskConversation } from "./use-task-conversation.js";
import { isLocalWorkspace, type WorkspaceScope } from "../model/scope.js";

export function TaskDetail({
  devices,
  client,
  id,
  onChanged,
  scope,
}: {
  client: TaskWorkspaceClient;
  id: string;
  devices: SyncDevice[];
  onChanged: () => void;
  scope: WorkspaceScope;
}) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const format = useFormatter();
  const followField = useId();
  const local = isLocalWorkspace(scope);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof failureCode>>();
  const [prompt, setPrompt] = useState("");
  const followId = useRef<{ prompt: string; id: string } | null>(null);
  const active = useRef(false);
  const { data, error, errorCode, refresh, loadingOlder, loadGap, loadOlder } = useTaskConversation(
    client,
    id,
    scope,
    setFailure,
  );
  async function cancel() {
    if (active.current) return;
    active.current = true;
    setFailure(undefined);
    setBusy(true);
    try {
      await client.tasks.cancel({ id }, { signal: AbortSignal.timeout(15_000) });
      refresh();
      onChanged();
    } catch (e) {
      setFailure(failureCode(e));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function follow(event: FormEvent) {
    event.preventDefault();
    if (active.current || !prompt.trim()) return;
    active.current = true;
    setFailure(undefined);
    if (followId.current?.prompt !== prompt) followId.current = { prompt, id: crypto.randomUUID() };
    setBusy(true);
    try {
      await client.tasks.followUp(
        { id: followId.current.id, parentTaskId: id, prompt },
        { signal: AbortSignal.timeout(15_000) },
      );
      followId.current = null;
      setPrompt("");
      onChanged();
    } catch (e) {
      setFailure(failureCode(e));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="space-y-3">
        <p role={error ? "alert" : "status"}>
          {error
            ? t(
                errorCode === "UPGRADE_REQUIRED"
                  ? errorCode
                  : local
                    ? "LOCAL_UNAVAILABLE"
                    : errorCode,
              )
            : c("loading")}
        </p>
        {error && (
          <Button variant="outline" onClick={refresh}>
            {c("retry")}
          </Button>
        )}
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-3">
          <Badge
            variant={
              data.task.status === "waiting"
                ? "default"
                : ["failed", "interrupted", "delivery_failed"].includes(data.task.status)
                  ? "destructive"
                  : "secondary"
            }
          >
            {t(data.task.status)}
          </Badge>
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
        <span>{data.task.provider === "claude" ? "Claude Code" : "Codex"}</span>
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
      {isTaskActive(data.task) ? (
        <Conversation
          task={data.task}
          entries={data.activity}
          gaps={data.activityGaps}
          loadGap={loadGap}
          more={data.activityBefore !== undefined}
          loading={loadingOlder}
          loadOlder={loadOlder}
        />
      ) : (
        <Collapsible>
          <CollapsibleTrigger
            render={<Button type="button" variant="ghost" size="sm" className="group" />}
          >
            <ChevronRight aria-hidden="true" className="group-data-panel-open:rotate-90" />
            {t("viewConversation")}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <Conversation
              task={data.task}
              entries={data.activity}
              gaps={data.activityGaps}
              loadGap={loadGap}
              more={data.activityBefore !== undefined}
              loading={loadingOlder}
              loadOlder={loadOlder}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
      {isTaskActive(data.task) && (
        <TaskInputComposer
          client={client}
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
          <ChevronRight aria-hidden="true" className="group-data-panel-open:rotate-90" />
          {t("activity")}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
            {data.events.map(({ cursor: eventCursor, event }) => (
              <li key={eventCursor}>
                {event.kind === "status"
                  ? t(event.status)
                  : event.kind === "request"
                    ? event.request.title
                    : t("applied")}
              </li>
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>
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
              onChange={(event) => setPrompt(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy || !prompt.trim()}>
            {t("send")}
          </Button>
        </form>
      )}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {t(failure)}
        </p>
      )}
    </div>
  );
}
