import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  TerminalDecision,
  TerminalRequestSummary,
  TerminalSession,
} from "@raypx/contracts/terminal";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Badge } from "@raypx/ui/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { ChevronDown, Terminal } from "lucide-react";
import { useRemoteQuery, type TaskWorkspaceClient } from "./remote-query.js";
import { ApprovalBody } from "./approval-body.js";

type ObservedClient = NonNullable<TaskWorkspaceClient["observed"]>;
type Client = TaskWorkspaceClient & { observed: ObservedClient };
export function ObservedApprovals({
  client,
  accountId,
}: {
  client: TaskWorkspaceClient;
  accountId: string;
}) {
  if (!client.observed) return null;
  return <ObservedList client={client as Client} accountId={accountId} />;
}
function ObservedList({ client, accountId }: { client: Client; accountId: string }) {
  const t = useTranslations("tasks"),
    c = useTranslations("common"),
    id = useId();
  const load = useCallback((signal: AbortSignal) => client.observed.list({}, { signal }), [client]);
  const { data, error, refresh } = useRemoteQuery(["observed", accountId], load, true, client);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  const [selected, setSelected] = useState<string | null | undefined>();
  const [history, setHistory] = useState(false),
    [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) refreshRef.current();
    }, 5000);
    return () => clearInterval(timer);
  }, [client, accountId]);
  const requests = data?.requests ?? [],
    pending = requests.filter(
      (request) => request.status === "pending" && Date.parse(request.expiresAt) > now,
    );
  const shown = history ? requests : pending,
    active = selected === undefined ? pending[0]?.id : selected;
  return (
    <section aria-labelledby={id} className="mb-7 border-b border-border pb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="flex items-center gap-2 text-base font-semibold">
          <Terminal className="size-4" aria-hidden="true" />
          {t("terminalRequests")}
          {pending.length > 0 && <Badge variant="secondary">{pending.length}</Badge>}
        </h2>
        {requests.length > pending.length && (
          <Button variant="ghost" size="sm" onClick={() => setHistory(!history)}>
            {t(history ? "terminalPendingOnly" : "terminalHistory")}
          </Button>
        )}
      </div>
      <p className="mb-4 max-w-[65ch] text-sm text-muted-foreground">{t("terminalHint")}</p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive-text">
          {t("terminalUnavailable")}{" "}
          <Button variant="link" size="sm" onClick={refresh}>
            {c("refresh")}
          </Button>
        </p>
      )}
      {!data && !error && (
        <div
          className="h-12 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
          aria-label={c("loading")}
        />
      )}
      {data && !shown.length && (
        <p className="text-sm text-muted-foreground">{t("terminalEmpty")}</p>
      )}
      <ul className="divide-y divide-border">
        {shown.map((request) => {
          const session = data?.sessions.find((value) => value.id === request.sessionId);
          return (
            <li key={request.id}>
              <Collapsible
                open={active === request.id}
                onOpenChange={(open) => setSelected(open ? request.id : null)}
              >
                <CollapsibleTrigger className="group flex w-full min-w-0 items-center justify-between gap-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {session?.projectName ?? request.title} ·{" "}
                      {request.provider === "claude" ? "Claude Code" : "Codex"}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {session?.deviceName ?? ""} · {request.title}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {t(
                      request.status === "pending" && Date.parse(request.expiresAt) <= now
                        ? "expired"
                        : request.status === "pending"
                          ? "terminalPending"
                          : request.status === "delivered"
                            ? "terminalDelivered"
                            : request.status === "outcome_unknown"
                              ? "terminalUnknown"
                              : request.status,
                    )}
                    <ChevronDown
                      className="size-4 transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pb-5">
                  <ObservedRequest
                    key={`${request.id}:${request.revision}`}
                    client={client}
                    accountId={accountId}
                    summary={request}
                    session={session}
                    now={now}
                    onChanged={(accepted) => {
                      if (accepted) {
                        setHistory(true);
                        setSelected(request.id);
                      }
                      refreshRef.current();
                    }}
                  />
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
function ObservedRequest({
  client,
  accountId,
  summary,
  session,
  now,
  onChanged,
}: {
  client: Client;
  accountId: string;
  summary: TerminalRequestSummary;
  session: (TerminalSession & { deviceName: string }) | undefined;
  now: number;
  onChanged: (accepted?: boolean) => void;
}) {
  const t = useTranslations("tasks"),
    c = useTranslations("common"),
    id = useId();
  const load = useCallback(
    (signal: AbortSignal) => client.observed.get({ id: summary.id }, { signal }),
    [client, summary.id],
  );
  const {
    data: request,
    error,
    refresh,
  } = useRemoteQuery(
    ["observed-request", accountId, summary.id, summary.revision],
    load,
    true,
    client,
  );
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const receipt = useRef<TerminalDecision | null>(null);
  const current = request?.epoch === summary.epoch && request.revision === summary.revision;
  const actionable =
    current && request?.status === "pending" && Date.parse(request.expiresAt) > now;
  const supported =
    request?.kind === "permission" &&
    session?.capabilities.permission &&
    session.capabilities.permissionTools.some(
      (tool) => tool === request.title || (tool === "MCP" && request.title.startsWith("mcp__")),
    );
  async function decide(type: "allow" | "deny") {
    if (!request || !actionable || !supported || busy) return;
    const input = receipt.current ?? {
      id: request.id,
      epoch: request.epoch,
      revision: request.revision,
      receiptId: crypto.randomUUID(),
      decision: type === "allow" ? { type: "allow" as const } : { type: "deny" as const, note },
    };
    receipt.current = input;
    setBusy(true);
    try {
      await client.observed.decide(input);
      setUncertain(false);
      onChanged(true);
      refresh();
    } catch {
      setUncertain(true);
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive-text">
        {t("terminalUnavailable")}{" "}
        <Button variant="link" size="sm" onClick={refresh}>
          {c("refresh")}
        </Button>
      </p>
    );
  if (!request)
    return (
      <div
        className="h-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
        aria-label={c("loading")}
      />
    );
  return (
    <div className="space-y-4">
      <ApprovalBody request={request} />
      {actionable && supported ? (
        <>
          <p className="text-xs text-muted-foreground">
            {t("terminalWaitingHint")} ·{" "}
            {t("terminalExpires", { time: new Date(request.expiresAt).toLocaleTimeString() })}
          </p>
          <div className="max-w-2xl space-y-2">
            <label htmlFor={id} className="text-sm font-medium">
              {t("terminalDenyNote")}
            </label>
            <Textarea
              id={id}
              value={note}
              maxLength={8000}
              disabled={busy || uncertain}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-16"
            />
          </div>
          {uncertain ? (
            <div role="alert" className="space-y-3">
              <p className="max-w-[65ch] text-sm text-muted-foreground">
                {t("terminalReceiptUnknown")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void decide(receipt.current?.decision.type === "allow" ? "allow" : "deny")
                  }
                >
                  {t("terminalRetry")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    onChanged();
                    refresh();
                  }}
                >
                  {c("refresh")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void decide("allow")}>
                {t("allowOnce")}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void decide("deny")}>
                {t("deny")}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            !current && request.status === "pending"
              ? "terminalChanged"
              : request.status === "decided"
                ? "awaitingDevice"
                : request.status === "delivered"
                  ? "terminalDelivered"
                  : request.status === "outcome_unknown"
                    ? "terminalUnknown"
                    : request.status === "pending" && !supported
                      ? "terminalUnsupported"
                      : request.status === "pending"
                        ? "expired"
                        : request.status,
          )}
        </p>
      )}
    </div>
  );
}
