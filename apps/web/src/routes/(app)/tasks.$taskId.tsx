import { useSuspenseQuery } from "@tanstack/react-query";
import { cloudQueries, invalidateRunFacts } from "../../lib/cloud-queries";
import { useCloudQueries } from "../../lib/use-cloud-queries";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Composer } from "@voidmix/agent-ui/composer";
import { TaskProgress, RevisionReview } from "@voidmix/agent-ui/tasks";
import { Button } from "@voidmix/ui/components/ui/button";
import { useTranslations } from "../../i18n/client";
import { createRouteApiClient } from "../../lib/route-api";
import { createWebApiClient } from "../../lib/api-client";
import { captureProductEvent } from "../../lib/product-telemetry";
import { RouteError, RoutePending } from "../../features/navigation/route-state";
import { CloudRunView } from "../../features/runs/cloud-run-view";
import { taskLabels } from "../../features/conversations/labels";
export const Route = createFileRoute("/(app)/tasks/$taskId")({
  loader: async ({ context, params }) => {
    const queries = cloudQueries(context, createRouteApiClient());
    const [result] = await Promise.all([
      context.queryClient.ensureQueryData(queries.task(params.taskId)),
      context.queryClient.ensureQueryData(queries.capabilities()),
    ]);
    const project =
      result.task.scope.type === "project"
        ? await context.queryClient.ensureQueryData(queries.project(result.task.scope.projectId))
        : null;
    return {
      accountId: context.accountId,
      taskId: params.taskId,
      writable: !project || project.access === "write" || project.access === "manage",
    };
  },
  component: TaskPage,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});
function TaskPage() {
  const data = Route.useLoaderData();
  return <TaskDetail key={`${data.accountId}:${data.taskId}`} />;
}
function TaskDetail() {
  const { writable, taskId } = Route.useLoaderData();
  const { identity, queries, queryClient, resources } = useCloudQueries();
  const {
    data: { task, revisions, runs, rounds },
  } = useSuspenseQuery(queries.task(taskId));
  const { data: capabilities } = useSuspenseQuery({
    ...queries.capabilities(),
    refetchInterval: 15_000,
  });
  const [roundAction, setRoundAction] = useState<"continueRound" | "newRound">(
    task.status === "completed" ? "newRound" : "continueRound",
  );
  useEffect(() => {
    if (task.status === "completed") setRoundAction("newRound");
  }, [task.status]);
  const t = useTranslations("cloud");
  const api = useMemo(() => createWebApiClient(), []);
  const lifetime = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState(task.goal);
  const acceptIntents = useRef(new Map<string, string>());
  const startIntent = useRef<{
    prompt: string;
    action: string;
    version: number;
    key: string;
    conversationId?: string;
    roundId?: string;
    goalVersion?: number;
  } | null>(null);
  const navigate = Route.useNavigate();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState<string>();
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current?.abort();
  }, []);
  const refresh = useCallback(() => {
    void invalidateRunFacts(queryClient, identity, task.id);
  }, [queryClient, identity, task.id]);
  const selected =
    runs.find((run) => run.id === selection) ??
    [...runs].sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())[0];
  async function accept(revisionId: string) {
    const revision = revisions.find((item) => item.id === revisionId);
    if (!revision) return;
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || pending) return;
    setPending(true);
    setFailed(false);
    const idempotencyKey = acceptIntents.current.get(revisionId) ?? crypto.randomUUID();
    acceptIntents.current.set(revisionId, idempotencyKey);
    try {
      await api.cloud.tasks.acceptRevision(
        {
          taskId: task.id,
          revisionId,
          roundId: revision.roundId,
          goalVersion: revision.goalVersion,
          idempotencyKey,
        },
        { signal },
      );
      if (!signal.aborted) {
        acceptIntents.current.delete(revisionId);
        captureProductEvent("revision_accepted");
        refresh();
      }
    } catch {
      if (!signal.aborted) setFailed(true);
    } finally {
      if (!signal.aborted) setPending(false);
    }
  }
  async function start(prompt: string) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    if (
      startIntent.current?.prompt !== prompt ||
      startIntent.current.action !== roundAction ||
      (roundAction !== "newRound" && startIntent.current.version !== task.goalVersion)
    )
      startIntent.current = {
        prompt,
        action: roundAction,
        version: task.goalVersion,
        key: crypto.randomUUID(),
        ...(task.conversationId ? { conversationId: task.conversationId } : {}),
      };
    const intent = startIntent.current;
    if (!intent.conversationId) {
      const conversation = await api.cloud.conversations.create(
        {
          title: task.title,
          idempotencyKey: intent.key,
          ...(task.scope.type === "project" ? { projectId: task.scope.projectId } : {}),
        },
        { signal },
      );
      if (signal.aborted) return;
      intent.conversationId = conversation.id;
    }
    let result;
    if (roundAction === "newRound") {
      if (!intent.roundId || !intent.goalVersion) {
        const next = await api.cloud.tasks.startRound(
          {
            taskId: task.id,
            expectedGoalVersion: intent.version,
            goal: prompt,
            attachmentIds: [],
            idempotencyKey: intent.key,
          },
          { signal },
        );
        if (signal.aborted) return;
        intent.roundId = next.round.id;
        intent.goalVersion = next.round.goalVersion;
      }
      result = await api.cloud.conversations.sendTurn(
        {
          conversationId: intent.conversationId,
          taskId: task.id,
          roundId: intent.roundId,
          goalVersion: intent.goalVersion,
          prompt,
          mode: "computer",
          attachmentIds: [],
          idempotencyKey: intent.key,
        },
        { signal },
      );
    } else {
      result = await api.cloud.tasks.continueRound(
        {
          taskId: task.id,
          roundId: task.currentRoundId,
          goalVersion: task.goalVersion,
          conversationId: intent.conversationId,
          prompt,
          attachmentIds: [],
          idempotencyKey: intent.key,
        },
        { signal },
      );
    }
    if (!signal.aborted) {
      resources.markCreated(identity.accountId, result.run.id);
      refresh();
      captureProductEvent("turn_sent", { mode: "computer" });
      await navigate({
        to: "/chat/$conversationId",
        params: { conversationId: intent.conversationId },
      });
    }
  }
  const active = runs.some((run) => run.status === "queued" || run.status === "running");
  const disabledReason = !capabilities.computer
    ? t("capabilityOff")
    : capabilities.unavailableReason
      ? t("unavailable")
      : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <TaskProgress
        title={task.title}
        goal={task.goal}
        status={task.status}
        labels={taskLabels(t)}
      />
      {task.conversationId ? (
        <Link
          to="/chat/$conversationId"
          params={{ conversationId: task.conversationId }}
          className="text-sm underline"
        >
          {t("openConversation")}
        </Link>
      ) : null}
      {writable && !active && task.status !== "cancelled" ? (
        <div className="space-y-4">
          <label className="flex flex-col gap-2 text-sm">
            {t("taskAction")}
            <select
              className="rounded-lg border border-input bg-background px-3 py-2"
              value={roundAction}
              onChange={(event) =>
                setRoundAction(event.target.value as "continueRound" | "newRound")
              }
            >
              <option value="continueRound" disabled={task.status === "completed"}>
                {t("continueRound")} · {task.goalVersion}
              </option>
              <option value="newRound">{t("newRound")}</option>
            </select>
          </label>
          <p className="text-sm text-muted-foreground">
            {rounds.find((round) => round.id === task.currentRoundId)?.goal ?? task.goal}
          </p>
          <Composer
            value={draft}
            onValueChange={setDraft}
            onSubmit={start}
            {...(disabledReason ? { disabledReason } : {})}
            labels={{
              label: t("prompt"),
              placeholder: t("placeholder"),
              submit: t(roundAction),
              submitting: t("submitting"),
              failed: t("failed"),
              hint: t("hint"),
            }}
          />
        </div>
      ) : null}
      {failed ? <p role="alert">{t("failed")}</p> : null}
      <section className="flex flex-col gap-4" aria-label={t("revision")}>
        {[...revisions]
          .sort((a, b) => b.revision - a.revision)
          .map((revision) => (
            <div key={revision.id} className="space-y-3">
              <RevisionReview
                revision={revision.revision}
                summary={revision.summary}
                accepted={task.acceptedRevisionId === revision.id}
                pending={pending}
                {...(writable &&
                task.status === "review" &&
                task.currentRevisionId === revision.id &&
                revision.roundId === task.currentRoundId &&
                revision.goalVersion === task.goalVersion
                  ? { onAccept: () => void accept(revision.id) }
                  : {})}
                labels={{
                  revision: t("revision"),
                  accept: t("accept"),
                  accepted: t("accepted"),
                  pending: t("pending"),
                }}
              />
              <Button variant="outline" onClick={() => setSelection(revision.runId)}>
                {t("artifacts")}
              </Button>
            </div>
          ))}
      </section>
      {runs.length ? (
        <label className="flex flex-col gap-2 text-sm">
          {t("history")}
          <select
            className="rounded-lg border border-input bg-background px-3 py-2"
            value={selected?.id ?? ""}
            onChange={(event) => setSelection(event.target.value)}
          >
            {[...runs]
              .sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())
              .map((run) => (
                <option key={run.id} value={run.id}>
                  {run.prompt.slice(0, 70)} · {run.attempt}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      {selected ? (
        <CloudRunView
          key={selected.id}
          api={api}
          runId={selected.id}
          writable={writable}
          showOutput
          onRetry={(runId) => {
            setSelection(runId);
            refresh();
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
      )}
    </div>
  );
}
