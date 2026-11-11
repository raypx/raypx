import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { cn } from "@raypx/ui/lib/utils";
import { LoadingState } from "@raypx/ui/loading-state";
import { LockIcon } from "@raypx/icons/lock";
import { guestReturnTo } from "../../tasks/guest-draft.js";
import { authClient, apiUrl } from "../client.js";
import { safeReturnTo } from "../return-to.js";

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

const gateClass = "mx-auto flex w-full max-w-sm flex-col items-center gap-5 py-12 text-center";
const enterGate =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out";

/** Icon tile with two soft concentric halos; decorative only. */
function GateMedia({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "destructive";
}) {
  return (
    <div className="relative grid size-24 place-items-center">
      <span aria-hidden="true" className="absolute inset-0 rounded-full border border-border/60" />
      <span
        aria-hidden="true"
        className="absolute inset-3 rounded-full border border-dashed border-border"
      />
      <div
        className={cn(
          "relative grid size-12 place-items-center rounded-xl border shadow-soft",
          tone === "destructive"
            ? "border-destructive/20 bg-destructive/10 text-destructive-text"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        {children}
      </div>
    </div>
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
    <section className={cn(gateClass, enterGate)}>
      <GateMedia>
        <LockIcon aria-hidden="true" className="size-5" />
      </GateMedia>
      <div className="flex flex-col gap-2">
        <Heading className="text-xl leading-snug font-semibold tracking-tight text-balance">
          {title}
        </Heading>
        <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>
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
      <div className={cn(gateClass, enterGate)} role="alert">
        <GateMedia tone="destructive">
          <LockIcon aria-hidden="true" className="size-5" />
        </GateMedia>
        <div className="flex flex-col gap-2">
          <h2 className="text-xl leading-snug font-semibold tracking-tight text-balance">
            {c("networkError")}
          </h2>
          <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
            {c("sessionUnavailable")}
          </p>
        </div>
        <Button variant="outline" onClick={() => void session.refetch()}>
          {c("retry")}
        </Button>
      </div>
    );
  return session.data ? children(session.data.user.id) : guest;
}
