import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@raypx/ui/components/ui/button";
import type { DesktopBridge } from "../../../../bridge.js";
import { useTranslations } from "../../../i18n.js";
import { useDesktopPlatform } from "../../../lib/platform-context.js";
import { analytics } from "../../analytics/client.js";
import { authClient, webUrl } from "../client.js";

type Attempt = { id: string; bridge?: DesktopBridge };
type State =
  | "idle"
  | "opening"
  | "waiting"
  | "failed"
  | "expired"
  | "mismatch"
  | "refresh"
  | "refreshFailed";

function cancel(attempt: Attempt | null) {
  if (attempt?.bridge)
    void attempt.bridge.request.browserLoginCancel({ id: attempt.id }).catch(() => {});
}

export function BrowserAuthorization({
  reauthorizeHost,
  onAuthorized,
}: {
  reauthorizeHost?: true;
  onAuthorized: () => void | Promise<void>;
}) {
  const t = useTranslations("desktopLogin");
  const c = useTranslations("common");
  const platform = useDesktopPlatform();
  const session = authClient.useSession();
  const current = useRef<Attempt | null>(null);
  const [state, setState] = useState<State>("idle");
  useEffect(
    () => () => {
      cancel(current.current);
      current.current = null;
    },
    [],
  );

  async function resume(attempt: Attempt) {
    setState("refresh");
    try {
      await session.refetch();
      if (current.current !== attempt) return;
      const result = await authClient.getSession({
        fetchOptions: { signal: AbortSignal.timeout(10_000) },
      });
      if (result.error || !result.data) throw new Error("Session unavailable");
      if (current.current !== attempt) return;
      await onAuthorized();
      if (current.current === attempt) {
        current.current = null;
        setState("idle");
      }
    } catch {
      if (current.current === attempt) setState("refreshFailed");
    }
  }

  async function start() {
    if (current.current) return;
    const attempt: Attempt = { id: crypto.randomUUID() };
    current.current = attempt;
    setState("opening");
    try {
      const bridge = await platform.getBridge();
      if (current.current !== attempt) return;
      attempt.bridge = bridge;
      const input = { id: attempt.id };
      const { authorizationUrl } = await bridge.request.browserLoginStart(
        { ...input, webOrigin: webUrl, ...(reauthorizeHost ? { reauthorizeHost } : {}) },
        { maxRequestTime: 35_000 },
      );
      if (current.current !== attempt) return;
      if (!(await bridge.request.openExternal({ url: authorizationUrl })))
        throw new Error("Browser unavailable");
      if (current.current !== attempt) return;
      setState("waiting");
      await bridge.request.browserLoginWait(input, { maxRequestTime: 310_000 });
      if (current.current !== attempt) return;
      if (!reauthorizeHost) analytics.capture("sign_in_succeeded");
      await resume(attempt);
    } catch (error) {
      if (current.current !== attempt) return;
      cancel(attempt);
      current.current = null;
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      switch (code) {
        case "DESKTOP_LOGIN_CANCELLED":
          setState("idle");
          break;
        case "DESKTOP_LOGIN_EXPIRED":
          setState("expired");
          break;
        case "DESKTOP_LOGIN_ACCOUNT_MISMATCH":
          setState("mismatch");
          break;
        default:
          setState("failed");
      }
    }
  }

  const waiting = state === "opening" || state === "waiting";
  const message =
    state === "failed" || state === "expired" || state === "mismatch" || state === "refreshFailed";
  let label = t("openBrowser");
  if (state === "refreshFailed") label = c("retry");
  if (waiting || state === "refresh") label = c("working");
  return (
    <div className="grid gap-4">
      {state === "waiting" && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("waiting")}
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive-text">
          {t(state)}
        </p>
      )}
      <Button
        className="min-h-11"
        disabled={waiting || state === "refresh"}
        onClick={() => {
          if (state === "refreshFailed" && current.current) void resume(current.current);
          else void start();
        }}
      >
        {label}
      </Button>
      {waiting && (
        <Button
          variant="outline"
          onClick={() => {
            cancel(current.current);
            current.current = null;
            setState("idle");
          }}
        >
          {c("cancel")}
        </Button>
      )}
    </div>
  );
}

export function BrowserLogin({ returnTo }: { returnTo: string }) {
  const c = useTranslations("common");
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section aria-labelledby="auth-title" className="grid gap-4">
      <h1 id="auth-title" className="text-xl font-semibold">
        {c("signIn")}
      </h1>
      <BrowserAuthorization
        onAuthorized={async () => {
          await router.invalidate();
          await navigate({ to: returnTo, replace: true });
        }}
      />
    </section>
  );
}
