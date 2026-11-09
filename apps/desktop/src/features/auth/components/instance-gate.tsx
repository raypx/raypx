import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createApiClient } from "@raypx/client/api";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { MonitorIcon } from "@raypx/icons/monitor";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@raypx/ui/components/ui/empty";
import { LoadingState } from "@raypx/ui/loading-state";
import { useTranslations } from "@raypx/i18n/browser";
import { useDesktopPlatform } from "../../../lib/platform-context.tsx";
import { apiUrl, authClient, desktopFetch } from "../client.ts";
import { useDesktopSignOut } from "../sign-out.tsx";
import { WindowDragRegion } from "../../../components/window-drag-region.tsx";

function gateMessage(
  mismatch: boolean,
  state: string | undefined,
  checkFailed: boolean,
  signedIn: boolean,
) {
  if (mismatch) return "mismatch";
  if (state === "revoked") return "revoked";
  if (checkFailed) return "statusCheckFailed";
  if (state === "unregistered") return signedIn ? "bindIntro" : "intro";
  return "unavailable";
}

export function InstanceGate({ children }: { children: ReactNode }) {
  const platform = useDesktopPlatform();
  const { localRequest, isDesktop } = platform;
  const auth = useDesktopSignOut();
  const t = useTranslations("instances"),
    c = useTranslations("common");
  const session = authClient.useSession();
  const [registering, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    [checkingSession, setCheckingSession] = useState(false);
  const busy = registering || checkingSession || auth.busy;
  const status = useQuery({
    queryKey: ["instance", apiUrl],
    queryFn: () => localRequest("instance.status", {}),
    enabled: isDesktop(),
    retry: false,
  });
  const { refetch } = status;
  useEffect(() => {
    if (!isDesktop()) return;
    const refresh = () => {
      void localRequest("instance.refresh", {}).then(
        () => refetch(),
        () => {},
      );
    };
    refresh();
    const timer = setInterval(refresh, 300_000);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", refresh);
    };
  }, [refetch, isDesktop, localRequest]);
  if (!isDesktop()) return children;
  if (status.isPending)
    return (
      <>
        <WindowDragRegion />
        <LoadingState label={c("loading")} />
      </>
    );
  const binding = status.data?.binding;
  const mismatch =
    binding &&
    (binding.origin !== apiUrl ||
      (!session.error && session.data && binding.accountId !== session.data.user.id));
  if (status.data?.state === "registered" && !mismatch) return children;
  const canBind = status.data?.state === "unregistered";
  const sessionKnown = !session.isPending && !session.error;
  async function retrySession() {
    setCheckingSession(true);
    try {
      await session.refetch();
    } catch {
      // Session state owns the translated failure; never expose transport details.
    } finally {
      setCheckingSession(false);
    }
  }
  async function recover(signIn: boolean) {
    setFailed(false);
    const result = await auth.signOut(session.data?.user.id ?? null, signIn ? "/login" : undefined);
    if (result.status === "error") setFailed(true);
  }
  async function register() {
    const client = createApiClient({ baseUrl: apiUrl, fetch: desktopFetch });
    setBusy(true);
    setFailed(false);
    try {
      const result = await localRequest("instance.begin", { origin: apiUrl });
      if (!result.registered) {
        if (!result.code) throw new Error("INSTANCE_ENROLLMENT_REQUIRED");
        await client.instances.approve({ code: result.code });
        await localRequest("instance.poll", {});
      }
      await status.refetch();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      aria-labelledby="instance-title"
      className="flex h-dvh flex-col overflow-auto px-6 py-8 pt-[max(2rem,var(--raypx-titlebar-height,0px))]"
    >
      <WindowDragRegion />
      <Empty className="m-auto max-w-lg flex-none gap-6 p-0">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-12">
            <MonitorIcon className="size-6" />
          </EmptyMedia>
          <h1 id="instance-title">{t(canBind ? "title" : "registrationStatus")}</h1>
          <EmptyDescription>
            {t(
              gateMessage(
                Boolean(mismatch),
                status.data?.state,
                status.isError,
                Boolean(session.data),
              ),
            )}
          </EmptyDescription>
          {binding && binding.origin !== apiUrl && (
            <EmptyDescription className="wrap-anywhere">
              {t("originMismatch", { origin: binding.origin })}
            </EmptyDescription>
          )}
        </EmptyHeader>
        <EmptyContent className="gap-4">
          <div className="flex flex-wrap justify-center gap-2">
            {mismatch && !session.isPending && (
              <>
                {session.data && (
                  <Button variant="outline" disabled={busy} onClick={() => void recover(false)}>
                    {c("signOut")}
                  </Button>
                )}
                {binding?.origin === apiUrl && (
                  <Button disabled={busy} onClick={() => void recover(true)}>
                    {t("signInOriginal")}
                  </Button>
                )}
              </>
            )}
            {canBind &&
              sessionKnown &&
              (session.data ? (
                <Button
                  size="lg"
                  disabled={busy}
                  aria-busy={registering}
                  onClick={() => void register()}
                >
                  {t(registering ? "registering" : "bind")}
                </Button>
              ) : (
                <Link to="/login" className={buttonVariants({ size: "lg" })}>
                  {t("signInToContinue")}
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              ))}
            {status.isError && (
              <Button
                variant="outline"
                disabled={busy || status.isFetching}
                onClick={() => void refetch()}
              >
                {c("retry")}
              </Button>
            )}
            {canBind && session.error && (
              <Button
                variant="outline"
                disabled={busy || session.isPending}
                aria-busy={checkingSession || session.isPending}
                onClick={() => void retrySession()}
              >
                {checkingSession || session.isPending ? c("loading") : c("retry")}
              </Button>
            )}
          </div>
          {canBind && session.error && (
            <p role="alert" className="text-sm text-destructive-text">
              {t("sessionCheckFailed")}
            </p>
          )}
          {canBind && session.isPending && !session.error && (
            <p role="status" className="text-sm text-muted-foreground">
              {c("loading")}
            </p>
          )}
          {failed && (
            <p role="alert" className="text-destructive-text">
              {t("error")}
            </p>
          )}
          {canBind && <p className="text-xs/relaxed text-muted-foreground">{t("privacy")}</p>}
        </EmptyContent>
      </Empty>
    </main>
  );
}
