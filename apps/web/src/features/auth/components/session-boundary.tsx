import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { LoadingState } from "@raypx/ui/loading-state";
import { LockIcon } from "@raypx/icons/lock";
import { guestReturnTo } from "../../tasks/guest-draft.ts";
import { authClient, apiUrl } from "../client.ts";
import { safeReturnTo } from "../return-to.ts";

export function SignInLink({
  children,
  returnTo,
  variant = "default",
}: {
  children?: ReactNode;
  returnTo?: string;
  variant?: "default" | "outline";
}) {
  const navigate = useNavigate();
  const current = useLocation({ select: (location) => location.href });
  const c = useTranslations("common");
  return (
    <Link
      to="/login"
      search={{ returnTo: safeReturnTo(returnTo ?? current) }}
      className={cn(buttonVariants({ variant }))}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        void navigate({
          to: "/login",
          search: { returnTo: guestReturnTo(apiUrl, returnTo ?? current) },
        });
      }}
    >
      {children ?? c("signIn")}
    </Link>
  );
}

export function SignInGate({
  title,
  description,
  heading: Heading = "h2",
}: {
  title: string;
  description: string;
  heading?: "h1" | "h2";
}) {
  return (
    <section className="flex max-w-lg flex-col items-start gap-5 py-8">
      <div className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
        <LockIcon aria-hidden="true" className="size-5" />
      </div>
      <div className="space-y-2">
        <Heading className="text-xl leading-snug font-semibold tracking-tight">{title}</Heading>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <SignInLink />
    </section>
  );
}

/** Public chrome stays mounted while private features wait for a confirmed session. */
export function SessionBoundary({
  children,
  guest,
}: {
  children: (accountId: string) => ReactNode;
  guest: ReactNode;
}) {
  const session = authClient.useSession();
  const c = useTranslations("common");
  if (session.isPending) return <LoadingState label={c("loading")} />;
  if (session.error)
    return (
      <div className="flex max-w-lg flex-col items-start gap-5 py-8" role="alert">
        <div className="grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive-text">
          <LockIcon aria-hidden="true" className="size-5" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl leading-snug font-semibold tracking-tight">{c("networkError")}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{c("sessionUnavailable")}</p>
        </div>
        <Button variant="outline" onClick={() => void session.refetch()}>
          {c("retry")}
        </Button>
      </div>
    );
  return session.data ? children(session.data.user.id) : guest;
}
