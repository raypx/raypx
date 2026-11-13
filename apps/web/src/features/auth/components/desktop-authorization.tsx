import { useRef, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  desktopAuthorizationPath,
  desktopLoginPaths,
  desktopLoginPreviewSchema,
  desktopLoginRedirectSchema,
} from "@raypx/contracts/api";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { useTranslations } from "../../../i18n.js";
import { apiUrl, authClient } from "../client.js";

async function send(path: string, input: unknown, parent?: AbortSignal) {
  const timeout = AbortSignal.timeout(10_000);
  return fetch(new URL(`/api/auth${path}`, apiUrl), {
    method: "POST",
    credentials: "include",
    redirect: "error",
    signal: parent ? AbortSignal.any([parent, timeout]) : timeout,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function DesktopAuthorization({ oauth }: { oauth?: string }) {
  const t = useTranslations("desktopAuthorization");
  const c = useTranslations("common");
  const navigate = useNavigate();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const sending = useRef(false);
  const preview = useQuery({
    queryKey: ["desktop-authorization", apiUrl, oauth],
    queryFn: async ({ signal }) => {
      const response = await send(desktopLoginPaths.inspect, { oauthQuery: oauth }, signal);
      if (response.status === 401) return { status: "signed-out" } as const;
      if (response.status === 400) return { status: "expired" } as const;
      if (!response.ok) throw new Error("Desktop authorization unavailable");
      return {
        status: "ready",
        ...desktopLoginPreviewSchema.parse(await response.json()),
      } as const;
    },
    enabled: !!oauth,
    retry: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  const returnTo = `${desktopAuthorizationPath}?${new URLSearchParams({ oauth: oauth ?? "" })}`;
  const account = preview.data;
  const reauthenticate = account?.status === "ready" && account.reauthenticationRequired;
  const loginSearch = { returnTo, ...(reauthenticate ? { reauthenticate: true as const } : {}) };

  async function submit(action: "approve" | "deny" | "switch") {
    if (sending.current || account?.status !== "ready") return;
    sending.current = true;
    setBusy(true);
    setError(false);
    try {
      if (action === "switch") {
        const result = await authClient.signOut({
          fetchOptions: { signal: AbortSignal.timeout(10_000) },
        });
        if (result.error) throw new Error("Sign-out failed");
        router.options.context.queryClient.clear();
        await navigate({ to: "/login", search: { returnTo } });
        return;
      }
      const response = await send(desktopLoginPaths.decide, {
        oauthQuery: oauth,
        approve: action === "approve",
        accountId: account.accountId,
      });
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        await preview.refetch();
        setError(true);
        return;
      }
      if (!response.ok) throw new Error("Desktop authorization failed");
      const { redirectUri } = desktopLoginRedirectSchema.parse(await response.json());
      window.location.replace(redirectUri);
    } catch {
      setError(true);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="auth-title" className="grid w-full max-w-[400px] gap-4">
      <h1 id="auth-title" className="text-xl font-semibold">
        {t("title")}
      </h1>
      {(!oauth || account?.status === "expired") && <p role="alert">{t("expired")}</p>}
      {oauth && preview.isPending && <p role="status">{c("loading")}</p>}
      {preview.isError && (
        <>
          <p role="alert">{t("failed")}</p>
          <Button className="min-h-11" onClick={() => void preview.refetch()}>
            {c("retry")}
          </Button>
        </>
      )}
      {account?.status === "signed-out" && (
        <Link
          className={buttonVariants({ className: "min-h-11" })}
          to="/login"
          search={{ returnTo }}
        >
          {c("signIn")}
        </Link>
      )}
      {account?.status === "ready" && (
        <>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("device")}</dt>
              <dd className="break-all">{account.device}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("account")}</dt>
              <dd className="break-all">{account.email}</dd>
            </div>
          </dl>
          {!account.matchesProfile && (
            <p role="alert" className="text-sm">
              {t("mismatch")}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm">
              {t("failed")}
            </p>
          )}
          {reauthenticate && (
            <Link
              className={buttonVariants({ className: "min-h-11" })}
              to="/login"
              search={loginSearch}
            >
              {t("verifyIdentity")}
            </Link>
          )}
          {account.matchesProfile && !reauthenticate && (
            <Button className="min-h-11" disabled={busy} onClick={() => void submit("approve")}>
              {t("authorize")}
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => void submit("switch")}
            >
              {t("switchAccount")}
            </Button>
            <Button
              variant="ghost"
              className="min-h-11"
              disabled={busy}
              onClick={() => void submit("deny")}
            >
              {c("cancel")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
