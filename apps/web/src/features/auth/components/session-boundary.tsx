import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { LoadingState } from "@raypx/ui/loading-state";
import { LockKeyhole } from "lucide-react";
import { guestReturnTo } from "../../tasks/guest-draft";
import { authClient, apiUrl } from "../client";
import { safeReturnTo } from "../return-to";

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
    <section className="flex flex-col items-start gap-4 py-8">
      <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-muted to-muted/50 text-muted-foreground ring-1 ring-border/50">
        <LockKeyhole aria-hidden="true" className="size-5" />
      </div>
      <div className="space-y-2">
        <Heading className={Heading === "h1" ? undefined : "text-lg font-semibold"}>
          {title}
        </Heading>
        <p className="max-w-[65ch] text-sm text-muted-foreground">{description}</p>
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
      <div className="flex flex-col items-start gap-4 py-8">
        <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-destructive/10 to-destructive/5 text-destructive ring-1 ring-destructive/20">
          <LockKeyhole aria-hidden="true" className="size-5" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{c("networkError")}</h2>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            Unable to verify your session. Please check your connection and try again.
          </p>
        </div>
        <Button variant="outline" onClick={() => void session.refetch()}>
          {c("retry")}
        </Button>
      </div>
    );
  return session.data ? children(session.data.user.id) : guest;
}
