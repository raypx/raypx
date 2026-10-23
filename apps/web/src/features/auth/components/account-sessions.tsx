import { useEffect, useRef, useState } from "react";
import { Monitor } from "lucide-react";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { Modal } from "@raypx/ui/modal";
import type { authClient } from "../client";

type Client = Pick<typeof authClient, "listSessions" | "revokeSession" | "revokeOtherSessions">;
type Session = NonNullable<Awaited<ReturnType<Client["listSessions"]>>["data"]>[number];

function sessionLabel(userAgent?: string | null) {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null;
  const platform = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Macintosh|Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  return [browser, platform].filter(Boolean).join(" · ") || null;
}

/** Session tokens stay in component memory, outside query caches, markup and diagnostics. */
export function AccountSessions({
  client,
  currentSessionId,
}: {
  client: Client;
  currentSessionId: string;
}) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const locale = useLocale();
  const [sessions, setSessions] = useState<Session[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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
          setError(true);
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
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [client, currentSessionId, revision]);
  const others = sessions?.filter((session) => session.id !== currentSessionId) ?? [];
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section
      className="mt-9 mb-7 border-t border-border pt-7"
      aria-labelledby="account-sessions-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="account-sessions-title" className="text-base">
          {t("sessionsTitle")}
        </h2>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setError(false);
            setRevision((value) => value + 1);
          }}
        >
          {c(loading ? "loading" : "refresh")}
        </Button>
      </div>
      <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("sessionsHint")}</p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive-text">
          {c("networkError")}
        </p>
      )}
      {!sessions && loading && <LoadingState label={c("loading")} />}
      {sessions?.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{t("sessionsEmpty")}</p>
      )}
      <ul className="mt-3 divide-y divide-border">
        {sessions?.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center gap-3 py-4">
            <Monitor aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 basis-40">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">
                  {sessionLabel(session.userAgent) ?? t("unknownSession")}
                </h3>
                {session.id === currentSessionId && (
                  <Badge variant="secondary">{t("currentSession")}</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("sessionCreated", { date: formatter.format(new Date(session.createdAt)) })}
              </p>
              {session.ipAddress && (
                <p className="mt-1 break-all text-xs text-muted-foreground">{session.ipAddress}</p>
              )}
            </div>
            {session.id !== currentSessionId && (
              <RevokeSession
                title={t("revokeSession")}
                description={t("revokeSessionHint")}
                label={sessionLabel(session.userAgent) ?? t("unknownSession")}
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
        <div className="mt-4">
          <RevokeSession
            title={t("revokeOtherSessions")}
            description={t("revokeOtherSessionsHint")}
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
  const t = useTranslations("auth");
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"network" | "reauth" | null>(null);
  const active = useRef(false);
  async function submit() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await revoke();
      if (response.error) {
        setError(response.error.code === "SESSION_NOT_FRESH" ? "reauth" : "network");
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
      trigger={<Button variant="outline">{title}</Button>}
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
          {error === "reauth" ? t("sessionReauth") : c("networkError")}
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
