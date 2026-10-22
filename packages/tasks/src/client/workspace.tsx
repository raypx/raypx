import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import type { TaskClient } from "@raypx/client";
import { useRemoteQuery, type TaskWorkspaceClient } from "./remote-query.js";
import type {
  AgentTask,
  AgentProvider,
  SyncDevice,
  HumanRequest,
  HumanDecision,
  AgentEvent,
} from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@raypx/ui/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/ui/radio-group";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { isTaskActive } from "../index.js";
import { TaskList } from "./task-list.js";

const failureCodes = [
  "LOCAL_UNAVAILABLE",
  "DEVICE_OFFLINE",
  "PROJECT_BUSY",
  "AGENT_UNAVAILABLE",
  "REQUEST_EXPIRED",
  "ALREADY_RESOLVED",
  "REQUEST_CLOSED",
  "DEVICE_REVOKED",
  "SESSION_UNAVAILABLE",
  "RATE_LIMITED",
] as const;
function failureCode(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const code = (error as { data?: { error?: { code?: string } } }).data?.error?.code;
    const known = failureCodes.find((item) => item === code);
    if (known) return known;
  }
  return "NETWORK_UNAVAILABLE" as const;
}
interface Props {
  client: TaskWorkspaceClient;
  accountId: string | null;
  pending?: boolean;
  local?: boolean;
}
function Gate({ pending }: { pending?: boolean }) {
  const t = useTranslations("tasks");
  return (
    <div className="py-10" aria-busy={pending}>
      {pending ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          <h2>{t("signIn")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("signInHint")}</p>
        </>
      )}
    </div>
  );
}
export function TaskWorkspace(props: Props & { view?: "tasks" | "approvals" }) {
  if (!props.accountId || props.pending)
    return (
      <section className="mx-auto max-w-5xl p-8">
        <Gate {...(props.pending === undefined ? {} : { pending: props.pending })} />
      </section>
    );
  return <Workspace key={props.accountId} {...props} accountId={props.accountId} />;
}
function Workspace({
  client,
  accountId,
  view = "tasks",
  local = false,
}: Props & { view?: "tasks" | "approvals" }) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const [pages, setPages] = useState<string[]>([]);
  const before = pages.at(-1);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [tasks, devices, requests] = await Promise.all([
        client.tasks.list({ limit: 100, ...(before ? { before } : {}) }, { signal }),
        client.devices.list({}, { signal }),
        client.approvals.list({}, { signal }),
      ]);
      const last = tasks.at(-1);
      const cursor = last ? `${last.createdAt}:${last.id}` : undefined;
      // A short page may hit the local byte budget before the record limit.
      const more =
        view === "tasks" && cursor
          ? await client.tasks.list({ limit: 1, before: cursor }, { signal })
          : [];
      return { tasks, devices, requests, before, next: more.length ? cursor : undefined };
    },
    [client, before, view],
  );
  const { data, error, refresh } = useRemoteQuery(
    ["workspace", accountId, view, before ?? null],
    load,
    true,
    client,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <section
      data-tasks
      className="mx-auto max-w-[1400px] px-10 py-10 max-[760px]:px-5 max-[760px]:py-7"
    >
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t(view === "approvals" ? "inbox" : "title")}</h1>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
            {t(local ? "localHint" : view === "approvals" ? "inboxHint" : "intro")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh}>
            {c("refresh")}
          </Button>
          {view === "tasks" && (
            <Button onClick={() => setCreating((value) => !value)}>{t("create")}</Button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {t(local ? "LOCAL_UNAVAILABLE" : "NETWORK_UNAVAILABLE")}
        </p>
      )}
      {!data ? (
        <div aria-busy="true" className="h-48 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          {creating && (
            <CreateTask
              client={client}
              devices={data.devices}
              tasks={data.tasks}
              local={local}
              onCreated={(task) => {
                setSelected(task.id);
                setPages([]);
                setCreating(false);
                refresh();
              }}
            />
          )}
          {view === "approvals" ? (
            <div className="space-y-6">
              {data.requests.length === 0 ? (
                <p className="py-10 text-sm text-muted-foreground">{t("nothingWaiting")}</p>
              ) : (
                data.requests.map((request) => (
                  <Approval
                    key={request.id}
                    client={client}
                    request={request}
                    task={data.tasks.find((task) => task.id === request.taskId)}
                    onChanged={refresh}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="task-layout">
              <div>
                {data.tasks.length === 0 ? (
                  <div className="py-10">
                    <h2>{t("empty")}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t(local ? "localEmptyHint" : "emptyHint")}
                    </p>
                  </div>
                ) : (
                  <TaskList
                    key={data.before ?? "latest"}
                    tasks={data.tasks}
                    devices={data.devices}
                    selected={selected}
                    onSelect={setSelected}
                  />
                )}
                {(pages.length > 0 || data.next) && (
                  <nav aria-label={t("taskPages")} className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={!pages.length}
                      onClick={() => {
                        setPages((previous) => previous.slice(0, -1));
                        setSelected(null);
                      }}
                    >
                      {t("newerTasks")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!data.next || data.before !== before}
                      onClick={() => {
                        if (data.next) setPages((previous) => [...previous, data.next!]);
                        setSelected(null);
                      }}
                    >
                      {t("olderTasks")}
                    </Button>
                  </nav>
                )}
              </div>
              <div>
                {selected ? (
                  <TaskDetail
                    key={selected}
                    client={client}
                    id={selected}
                    local={local}
                    onChanged={refresh}
                  />
                ) : (
                  <p className="py-10 text-sm text-muted-foreground">{t("selectTask")}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
function CreateTask({
  client,
  devices,
  tasks,
  onCreated,
  local,
}: {
  client: TaskWorkspaceClient;
  devices: SyncDevice[];
  tasks: AgentTask[];
  onCreated: (task: AgentTask) => void;
  local: boolean;
}) {
  const t = useTranslations("tasks");
  const id = useId();
  const localDevice = local ? devices[0] : undefined;
  const [deviceId, setDeviceId] = useState(localDevice?.id ?? "");
  const [projectId, setProjectId] = useState(
    localDevice?.projects.length === 1 ? localDevice.projects[0]!.id : "",
  );
  const [provider, setProvider] = useState<AgentProvider>(
    localDevice?.capabilities.find((capability) => capability.available)?.provider ?? "claude",
  );
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"run" | "plan">("run");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof failureCode>>();
  const submission = useRef<{ key: string; id: string } | null>(null);
  const device = devices.find((item) => item.id === deviceId);
  const project = device?.projects.find((item) => item.id === projectId);
  const occupied = tasks.some(
    (task) => task.deviceId === deviceId && task.projectId === projectId && isTaskActive(task),
  );
  const available = Boolean(
    device?.online &&
    project?.providers.includes(provider) &&
    device.capabilities.some((c) => c.provider === provider && c.available),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!available || busy || occupied) return;
    const key = JSON.stringify({ deviceId, projectId, provider, prompt, mode });
    if (submission.current?.key !== key) submission.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError(undefined);
    try {
      onCreated(
        await client.tasks.create(
          { id: submission.current.id, deviceId, projectId, provider, prompt, mode },
          { signal: AbortSignal.timeout(15_000) },
        ),
      );
    } catch (failure) {
      setError(failureCode(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mb-8 space-y-4 rounded-lg border border-border bg-sidebar p-5"
    >
      <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
        <Field>
          <FieldLabel htmlFor={`${id}-device`}>{t("device")}</FieldLabel>
          <NativeSelect
            id={`${id}-device`}
            className="w-full"
            required
            value={deviceId}
            onChange={(event) => {
              setDeviceId(event.target.value);
              setProjectId("");
            }}
          >
            <NativeSelectOption value="">{t("chooseDevice")}</NativeSelectOption>
            {devices
              .filter((d) => !d.revoked)
              .map((d) => (
                <NativeSelectOption key={d.id} value={d.id} disabled={!d.online}>
                  {d.name} · {t(d.online ? "online" : "offline")}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-project`}>{t("project")}</FieldLabel>
          <NativeSelect
            id={`${id}-project`}
            className="w-full"
            required
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <NativeSelectOption value="">{t("chooseProject")}</NativeSelectOption>
            {device?.projects.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {project?.dirty && <p className="text-sm text-muted-foreground">{t("dirty")}</p>}
      <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
        <Field>
          <FieldLabel htmlFor={`${id}-agent`}>{t("agent")}</FieldLabel>
          <NativeSelect
            id={`${id}-agent`}
            className="w-full"
            value={provider}
            onChange={(event) => setProvider(event.target.value as AgentProvider)}
          >
            <NativeSelectOption value="claude">Claude Code</NativeSelectOption>
            <NativeSelectOption value="codex">Codex</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-mode`}>{t("mode")}</FieldLabel>
          <NativeSelect
            id={`${id}-mode`}
            className="w-full"
            value={mode}
            onChange={(event) => setMode(event.target.value as "run" | "plan")}
          >
            <NativeSelectOption value="run">{t("runMode")}</NativeSelectOption>
            <NativeSelectOption value="plan">{t("planMode")}</NativeSelectOption>
          </NativeSelect>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`${id}-prompt`}>{t("prompt")}</FieldLabel>
        <Textarea
          id={`${id}-prompt`}
          className="min-h-24"
          required
          maxLength={32000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </Field>
      <p className="text-xs text-muted-foreground">{t("executionHint")}</p>
      {occupied && (
        <p role="status" className="text-sm">
          {t("PROJECT_BUSY")}
        </p>
      )}
      {!available && <p className="text-sm text-muted-foreground">{t("availabilityHint")}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <Button type="submit" disabled={!available || occupied || busy || !prompt.trim()}>
        {t(busy ? "sending" : "send")}
      </Button>
    </form>
  );
}
function TaskDetail({
  client,
  id,
  onChanged,
  local,
}: {
  client: TaskWorkspaceClient;
  id: string;
  onChanged: () => void;
  local: boolean;
}) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const followField = useId();
  const cursor = useRef(0);
  const history = useRef(new Map<number, AgentEvent>());
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await client.tasks.get({ id, after: cursor.current }, { signal });
      for (const item of result.events) {
        history.current.set(item.cursor, item.event);
        cursor.current = Math.max(cursor.current, item.cursor);
      }
      return {
        ...result,
        events: [...history.current.entries()].map(([position, event]) => ({
          cursor: position,
          event,
        })),
      };
    },
    [client, id],
  );
  const { data, error, refresh } = useRemoteQuery(["task", id], load, true, client);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof failureCode>>();
  const [prompt, setPrompt] = useState("");
  const followId = useRef<{ prompt: string; id: string } | null>(null);
  async function cancel() {
    setBusy(true);
    try {
      await client.tasks.cancel({ id }, { signal: AbortSignal.timeout(15_000) });
      refresh();
      onChanged();
    } catch (e) {
      setFailure(failureCode(e));
    } finally {
      setBusy(false);
    }
  }
  async function follow(event: FormEvent) {
    event.preventDefault();
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
      setBusy(false);
    }
  }
  if (!data)
    return (
      <p role={error ? "alert" : "status"}>
        {error ? t(local ? "LOCAL_UNAVAILABLE" : "NETWORK_UNAVAILABLE") : c("loading")}
      </p>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2>{t(data.task.status)}</h2>
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
      <p className="whitespace-pre-wrap text-sm">{data.task.prompt}</p>
      <time className="block text-xs text-muted-foreground" dateTime={data.task.updatedAt}>
        {new Date(data.task.updatedAt).toLocaleString()}
      </time>
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
      {data.task.summary && (
        <>
          <h3 className="text-sm font-medium">{t("result")}</h3>
          <pre className="task-content">{data.task.summary}</pre>
        </>
      )}
      <details>
        <summary className="cursor-pointer text-sm">{t("activity")}</summary>
        <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
          {data.events.map(
            ({ cursor: eventCursor, event }: { cursor: number; event: AgentEvent }) => (
              <li key={eventCursor}>
                {event.kind === "status"
                  ? t(event.status)
                  : event.kind === "request"
                    ? event.request.title
                    : t("applied")}
              </li>
            ),
          )}
        </ol>
      </details>
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
function Approval({
  client,
  request,
  task,
  onChanged,
}: {
  client: TaskWorkspaceClient;
  request: HumanRequest;
  task?: AgentTask | undefined;
  onChanged: () => void;
}) {
  const t = useTranslations("tasks");
  const id = useId();
  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof failureCode>>();
  const closed = request.status !== "pending";
  async function decide(decision: HumanDecision) {
    setBusy(true);
    try {
      await client.approvals.decide(
        { id: request.id, decision },
        { signal: AbortSignal.timeout(15_000) },
      );
      onChanged();
    } catch (failure) {
      setError(failureCode(failure));
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{request.title || t(request.kind)}</h3>
        <span className="text-xs text-muted-foreground">{t(request.status)}</span>
      </div>
      {task && <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{task.prompt}</p>}
      {request.body && <pre className="task-content">{request.body}</pre>}
      {!closed && (
        <div className="mt-4 space-y-4">
          {request.questions.map((question) => (
            <fieldset key={question.id} className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{question.text}</legend>
              {question.multiSelect ? (
                question.options.map((option, index) => (
                  <Field key={option.label} orientation="horizontal">
                    <Checkbox
                      id={`${id}-${question.id}-${index}`}
                      checked={answers[question.id]?.includes(option.label) ?? false}
                      onCheckedChange={(checked) =>
                        setAnswers((previous) => ({
                          ...previous,
                          [question.id]: checked
                            ? [...(previous[question.id] ?? []), option.label]
                            : (previous[question.id] ?? []).filter((item) => item !== option.label),
                        }))
                      }
                    />
                    <OptionLabel htmlFor={`${id}-${question.id}-${index}`} option={option} />
                  </Field>
                ))
              ) : (
                <RadioGroup
                  value={answers[question.id]?.[0] ?? ""}
                  onValueChange={(value) =>
                    setAnswers((previous) => ({ ...previous, [question.id]: [String(value)] }))
                  }
                >
                  {question.options.map((option, index) => (
                    <Field key={option.label} orientation="horizontal">
                      <RadioGroupItem id={`${id}-${question.id}-${index}`} value={option.label} />
                      <OptionLabel htmlFor={`${id}-${question.id}-${index}`} option={option} />
                    </Field>
                  ))}
                </RadioGroup>
              )}
              <Field>
                <FieldLabel htmlFor={`${id}-${question.id}-custom`}>{t("customAnswer")}</FieldLabel>
                <Input
                  id={`${id}-${question.id}-custom`}
                  value={
                    answers[question.id]?.every((value) =>
                      question.options.every((option) => option.label !== value),
                    )
                      ? (answers[question.id]?.join(", ") ?? "")
                      : ""
                  }
                  onChange={(event) =>
                    setAnswers((previous) => ({
                      ...previous,
                      [question.id]: event.target.value ? [event.target.value] : [],
                    }))
                  }
                />
              </Field>
            </fieldset>
          ))}
          <Field>
            <FieldLabel htmlFor={`${id}-note`}>{t("note")}</FieldLabel>
            <Textarea
              id={`${id}-note`}
              value={note}
              maxLength={8000}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                (request.kind === "question" &&
                  request.questions.some((q) => !answers[q.id]?.length))
              }
              onClick={() =>
                void decide(
                  request.kind === "question" ? { type: "answer", answers } : { type: "allow" },
                )
              }
            >
              {t(
                request.kind === "question"
                  ? "submitAnswer"
                  : request.kind === "plan"
                    ? "approvePlan"
                    : "allowOnce",
              )}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void decide({ type: "deny", note })}
            >
              {t(request.kind === "plan" ? "revisePlan" : "deny")}
            </Button>
          </div>
        </div>
      )}
      {request.status === "decided" && (
        <p className="mt-3 text-xs text-muted-foreground">{t("awaitingDevice")}</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t(error)}
        </p>
      )}
    </section>
  );
}
function OptionLabel({
  htmlFor,
  option,
}: {
  htmlFor: string;
  option: { label: string; description: string };
}) {
  return (
    <FieldLabel htmlFor={htmlFor} className="block font-normal leading-normal">
      {option.label}
      <small className="block text-muted-foreground">{option.description}</small>
    </FieldLabel>
  );
}
export function DeviceSettings({
  client,
  accountId,
  pending,
}: Omit<Props, "client"> & { client: TaskClient }) {
  if (!accountId || pending) return <Gate {...(pending === undefined ? {} : { pending })} />;
  return <Devices key={accountId} accountId={accountId} client={client} />;
}
function Devices({ client, accountId }: { client: TaskClient; accountId: string }) {
  const t = useTranslations("tasks");
  const load = useCallback((signal: AbortSignal) => client.devices.list({}, { signal }), [client]);
  const { data, error, refresh } = useRemoteQuery(["devices", accountId], load, true, client);
  const [busy, setBusy] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState(false);
  async function revoke(device: SyncDevice) {
    if (!window.confirm(t("revokeConfirm"))) return;
    setBusy(device.id);
    try {
      await client.devices.revoke({ deviceId: device.id, epoch: device.epoch });
      refresh();
    } catch {
      setMutationError(true);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="mt-8 border-t border-border pt-7" data-tasks>
      <h2 className="text-base">{t("devices")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("devicesHint")}</p>
      {(error || mutationError) && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t("NETWORK_UNAVAILABLE")}
        </p>
      )}
      {data?.length === 0 && <p className="mt-5 text-sm text-muted-foreground">{t("noDevices")}</p>}
      {data?.map((device) => (
        <div
          key={device.id}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-5"
        >
          <div>
            <h3 className="text-sm font-medium">{device.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {device.platform} ·{" "}
              {t(device.revoked ? "revoked" : device.online ? "online" : "offline")}
              {device.lastSeenAt && <> · {new Date(device.lastSeenAt).toLocaleString()}</>}
            </p>
          </div>
          {!device.revoked && (
            <Button
              variant="outline"
              disabled={busy === device.id}
              onClick={() => void revoke(device)}
            >
              {t("revoke")}
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
