import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { useAuthActions } from "@raypx/auth/hooks";
import { createApiClient } from "@raypx/client/api";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { useTranslations } from "@raypx/i18n/browser";
import { useDesktopPlatform } from "../../../lib/platform-context";
import { apiUrl, webUrl, authClient, desktopFetch } from "../client";
import { signOutDesktopHost } from "../../tasks/host-session";
import { analytics } from "../../analytics/client";

function gateMessage(mismatch: boolean, state: string | undefined, checkFailed: boolean) {
  if (mismatch) return "mismatch";
  if (state === "revoked") return "revoked";
  if (checkFailed) return "statusCheckFailed";
  if (state === "unregistered") return "intro";
  return "unavailable";
}

export function InstanceGate({ children }: { children: ReactNode }) {
  const platform = useDesktopPlatform();
  const { localRequest, isDesktop } = platform;
  const router = useRouter(),
    queries = useQueryClient();
  const auth = useAuthActions({ client: authClient, webUrl });
  const t = useTranslations("instances"),
    c = useTranslations("common");
  const session = authClient.useSession();
  const [registering, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const busy = registering || auth.busy;
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
  if (status.isPending) return <LoadingState label={c("loading")} />;
  const binding = status.data?.binding;
  const mismatch =
    binding &&
    (binding.origin !== apiUrl ||
      (!session.error && session.data && binding.accountId !== session.data.user.id));
  if (status.data?.state === "registered" && !mismatch) return children;
  const canBind = status.data?.state === "unregistered";
  const sessionKnown = !session.isPending && !session.error;
  async function recover(signIn: boolean) {
    setFailed(false);
    const complete = async () => {
      await signOutDesktopHost(platform);
      analytics.reset();
      const accountId = session.data?.user.id;
      if (accountId)
        queries.removeQueries({ predicate: (query) => query.queryKey.includes(accountId) });
      await status.refetch();
      await router.invalidate();
      if (signIn) await router.navigate({ to: "/login" });
    };
    const result =
      auth.error?.kind === "completion"
        ? await auth.retryCompletion()
        : await auth.signOut(complete);
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
    <main className="mx-auto flex max-w-lg flex-col gap-5 px-6 py-16">
      <h1>{t("title")}</h1>
      <p>{t(gateMessage(Boolean(mismatch), status.data?.state, status.isError))}</p>
      {binding && binding.origin !== apiUrl && (
        <p>{t("originMismatch", { origin: binding.origin })}</p>
      )}
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
          <Button disabled={busy} onClick={() => void register()}>
            {t("bind")}
          </Button>
        ) : (
          <Link to="/login" className={buttonVariants()}>
            {c("signIn")}
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
      {failed && <p role="alert">{t("error")}</p>}
    </main>
  );
}
