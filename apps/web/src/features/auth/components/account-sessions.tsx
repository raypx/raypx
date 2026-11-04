import { useEffect, useRef, useState } from "react";
import { MonitorIcon } from "@raypx/icons/monitor";
import { RefreshIcon } from "@raypx/icons/refresh";
import { ClockIcon } from "@raypx/icons/clock";
import { GlobalIcon } from "@raypx/icons/global";
import { LogoutIcon } from "@raypx/icons/logout";
import { ShieldCheckIcon } from "@raypx/icons/shield-check";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { IconButton } from "@raypx/ui/icon-button";
import { Modal } from "@raypx/ui/modal";
import { StatusBadge } from "@raypx/ui/status-badge";
import { EmptyState } from "@raypx/ui/empty-state";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import type { authClient } from "../client";

type Client = Pick<typeof authClient, "listSessions" | "revokeSession" | "revokeOtherSessions">;
type Session = NonNullable<Awaited<ReturnType<Client["listSessions"]>>["data"]>[number];
function sessionFailure(error: { code?: string | undefined; status?: number | undefined }) {
  if (error.code === "SESSION_NOT_FRESH") return "reauth" as const;
  if (error.status === 401 || error.code === "UNAUTHORIZED") return "expired" as const;
  if (error.status === 403 || error.code === "FORBIDDEN" || error.code === "INVALID_ORIGIN")
    return "forbidden" as const;
  return "network" as const;
}

// First match wins: Edge user agents also name Chrome and Safari, Chrome names Safari.
const browsers: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const platforms: [RegExp, string][] = [
  [/iPhone|iPad/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];
function sessionLabel(userAgent?: string | null) {
  if (!userAgent) return null;
  const match = (rules: [RegExp, string][]) =>
    rules.find(([pattern]) => pattern.test(userAgent))?.[1];
  return [match(browsers), match(platforms)].filter(Boolean).join(" · ") || null;
}

/** Session tokens stay in component memory, outside query caches, markup and diagnostics. */
export function AccountSessions({
  client,
  currentSessionId,
}: {
  client: Client;
  currentSessionId: string;
}) {
  const t = useTranslations("auth.sessions");
  const c = useTranslations("common");
  const format = useFormatter();
  const [sessions, setSessions] = useState<Session[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof sessionFailure> | null>(null);
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    void client
      .listSessions({
        fetchOptions: { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) },
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.error || !response.data) {
          const failure = response.error ? sessionFailure(response.error) : "network";
          setError(failure);
          if (failure === "expired") setSessions(undefined);
          return;
        }
        setSessions(
          [...response.data].sort(
            (a, b) =>
              Number(b.id === currentSessionId) - Number(a.id === currentSessionId) ||
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("network");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, currentSessionId, revision]);
  const others = sessions?.filter((session) => session.id !== currentSessionId) ?? [];
  return (
    <section aria-labelledby="account-sessions-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ShieldCheckIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2 id="account-sessions-title" className="text-sm font-medium">
            {t("title")}
          </h2>
          {sessions && <Badge variant="outline">{sessions.length}</Badge>}
        </div>
        <IconButton
          label={c(loading ? "loading" : "refresh")}
          variant="outline"
          className="ml-auto"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setError(null);
            setRevision((value) => value + 1);
          }}
        >
          <RefreshIcon
            aria-hidden="true"
            className={loading ? "animate-spin motion-reduce:animate-none" : undefined}
          />
        </IconButton>
      </div>
      <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{t("hint")}</p>
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>
            {error === "network" ? c("networkError") : t(error)}
            {error === "expired" && (
              <a className="ml-2 underline" href="/login">
                {c("signIn")}
              </a>
            )}
          </AlertDescription>
        </Alert>
      )}
      {!sessions && loading && <LoadingState label={c("loading")} />}
      {sessions?.length === 0 && (
        <EmptyState title={t("empty")} icon={<MonitorIcon aria-hidden="true" />} className="py-8" />
      )}
      <ul className="mt-5 flex flex-col gap-3">
        {sessions?.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-4"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <MonitorIcon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1 basis-40">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">
                  {sessionLabel(session.userAgent) ?? t("unknown")}
                </h3>
                {session.id === currentSessionId && (
                  <StatusBadge label={t("current")} tone="success" />
                )}
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <ClockIcon aria-hidden="true" className="size-3.5 shrink-0" />
                <span>
                  {t("created", {
                    date: format.dateTime(new Date(session.createdAt), "timestamp"),
                  })}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("expires", {
                  date: format.dateTime(new Date(session.expiresAt), "timestamp"),
                })}
              </p>
              {session.ipAddress && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <GlobalIcon aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="break-all">{session.ipAddress}</span>
                </p>
              )}
            </div>
            {session.id !== currentSessionId && (
              <RevokeSession
                title={t("revoke")}
                description={t("revokeHint")}
                label={sessionLabel(session.userAgent) ?? t("unknown")}
                revoke={() =>
                  client.revokeSession({
                    token: session.token,
                    fetchOptions: { signal: AbortSignal.timeout(15_000) },
                  })
                }
                onRevoked={() => {
                  request.current?.abort();
                  setLoading(false);
                  setSessions((previous) => previous?.filter((item) => item.id !== session.id));
                }}
              />
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-end border-t border-border pt-5">
          <RevokeSession
            title={t("revokeOthers")}
            description={t("revokeOthersHint")}
            revoke={() =>
              client.revokeOtherSessions({ fetchOptions: { signal: AbortSignal.timeout(15_000) } })
            }
            onRevoked={() => {
              request.current?.abort();
              setLoading(false);
              setSessions((previous) =>
                previous?.filter((session) => session.id === currentSessionId),
              );
            }}
          />
        </div>
      )}
    </section>
  );
}

function RevokeSession({
  title,
  description,
  label,
  revoke,
  onRevoked,
}: {
  title: string;
  description: string;
  label?: string;
  revoke: () => Promise<{ error?: { code?: string | undefined } | null | undefined }>;
  onRevoked: () => void;
}) {
  const t = useTranslations("auth.sessions");
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof sessionFailure> | null>(null);
  const active = useRef(false);
  async function submit() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await revoke();
      if (response.error) {
        setError(sessionFailure(response.error));
        return;
      }
      setOpen(false);
      onRevoked();
    } catch {
      setError("network");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      description={description}
      closeLabel={c("close")}
      trigger={
        <Button variant="outline" className="ml-auto">
          <LogoutIcon aria-hidden="true" data-icon="inline-start" />
          {title}
        </Button>
      }
      open={open}
      busy={busy}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setError(null);
      }}
    >
      {label && <p className="text-sm font-medium">{label}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {error === "network" ? c("networkError") : t(error)}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          {c("cancel")}
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => void submit()}>
          {busy ? c("working") : title}
        </Button>
      </div>
    </Modal>
  );
}
