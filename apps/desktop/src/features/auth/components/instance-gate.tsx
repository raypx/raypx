import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createApiClient } from "@raypx/client/api";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { useTranslations } from "@raypx/i18n/browser";
import { useDesktopPlatform } from "../../../lib/platform-context";
import { apiUrl, authClient, desktopFetch } from "../client";
export function InstanceGate({ children }: { children: ReactNode }) {
  const { localRequest, isDesktop } = useDesktopPlatform();
  const t = useTranslations("instances"),
    c = useTranslations("common");
  const session = authClient.useSession();
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
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
      <p>
        {mismatch
          ? t("mismatch")
          : status.data?.state === "revoked"
            ? t("revoked")
            : canBind
              ? t("intro")
              : t("unavailable")}
      </p>
      {canBind && session.data && !session.error && !session.isPending ? (
        <Button disabled={busy} onClick={() => void register()}>
          {t("bind")}
        </Button>
      ) : canBind && !session.data && !session.error && !session.isPending ? (
        <Link to="/login">{c("signIn")}</Link>
      ) : null}
      <Button variant="outline" disabled={busy} onClick={() => void status.refetch()}>
        {c("retry")}
      </Button>
      {failed && <p role="alert">{t("error")}</p>}
    </main>
  );
}
