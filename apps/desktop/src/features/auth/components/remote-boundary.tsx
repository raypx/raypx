import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { useTranslations } from "@raypx/i18n/browser";
import { authClient } from "../client";
import { desktopReturnTo } from "../return-to";

function DesktopSignIn({ returnTo }: { returnTo?: string }) {
  const location = useLocation();
  const c = useTranslations("common");
  return (
    <Button
      render={
        <Link to="/login" search={{ returnTo: desktopReturnTo(returnTo ?? location.href) }} />
      }
    >
      {c("signIn")}
    </Button>
  );
}

export function RemoteBoundary({ children }: { children: (accountId: string) => ReactNode }) {
  const session = authClient.useSession();
  const t = useTranslations("localWorkspace"),
    c = useTranslations("common");
  if (session.isPending) return <LoadingState label={c("loading")} />;
  if (session.error)
    return (
      <div className="space-y-3 py-6">
        <p role="alert">{c("networkError")}</p>
        <Button variant="outline" onClick={() => void session.refetch()}>
          {c("retry")}
        </Button>
      </div>
    );
  if (session.data) return children(session.data.user.id);
  return (
    <section className="space-y-3 py-6">
      <h2 className="text-base font-semibold">{t("remoteSignIn")}</h2>
      <p className="max-w-[65ch] text-sm text-muted-foreground">{t("remoteSignInHint")}</p>
      <DesktopSignIn />
    </section>
  );
}
