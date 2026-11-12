import { useTranslations } from "../../../i18n.js";
import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { Alert, AlertAction, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "@raypx/ui/components/ui/empty";
import { LoadingState } from "@raypx/ui/loading-state";

import { authClient } from "../client.js";
import { desktopReturnTo } from "../return-to.js";

function DesktopSignIn({ returnTo }: { returnTo?: string }) {
  const location = useLocation();
  const c = useTranslations("common");
  return (
    <Link
      to="/login"
      search={{ returnTo: desktopReturnTo(returnTo ?? location.href) }}
      className={buttonVariants()}
    >
      {c("signIn")}
    </Link>
  );
}

export function RemoteBoundary({ children }: { children: (accountId: string) => ReactNode }) {
  const session = authClient.useSession();
  const t = useTranslations("localWorkspace"),
    c = useTranslations("common");
  if (session.isPending) return <LoadingState label={c("loading")} />;
  if (session.error)
    return (
      <div className="py-6">
        <Alert variant="destructive">
          <AlertDescription>{c("networkError")}</AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="sm" onClick={() => void session.refetch()}>
              {c("retry")}
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  if (session.data) return children(session.data.user.id);
  return (
    <section>
      <Empty className="items-start px-0 py-8 text-left">
        <EmptyHeader className="items-start">
          <h2 className="text-base font-semibold">{t("remoteSignIn")}</h2>
          <EmptyDescription>{t("remoteSignInHint")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="items-start">
          <DesktopSignIn />
        </EmptyContent>
      </Empty>
    </section>
  );
}
