import type { ComponentType, ReactNode } from "react";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { MailIcon } from "@raypx/icons/mail";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { LogoutIcon } from "@raypx/icons/logout";
import { Button, buttonVariants } from "@raypx/ui/components/ui/button";
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
import { Avatar } from "@raypx/ui/avatar";
import { StatusBadge } from "@raypx/ui/status-badge";
import { useTranslations } from "@raypx/i18n/browser";
import type { AccountProfile } from "../index.js";

export interface AccountLinkProps {
  to: "login" | "signup";
  className: string;
  children: ReactNode;
}

export function SignedOutAccount({
  LinkComponent,
}: {
  LinkComponent: ComponentType<AccountLinkProps>;
}) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  return (
    <section className="flex flex-col items-start gap-6 py-8">
      <UserCircleIcon aria-hidden="true" className="size-8 text-muted-foreground" />
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">{t("signedOut")}</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{t("signedOutIntro")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <LinkComponent to="login" className={buttonVariants()}>
          {c("signIn")}
          <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
        </LinkComponent>
        <LinkComponent to="signup" className={buttonVariants({ variant: "ghost" })}>
          {t("create")}
        </LinkComponent>
      </div>
    </section>
  );
}

export interface AccountDetailsProps {
  account: AccountProfile;
  busy: boolean;
  onSignOut: () => unknown;
  children?: ReactNode;
}

export function AccountDetails({ account, busy, onSignOut, children }: AccountDetailsProps) {
  const t = useTranslations("auth");
  const c = useTranslations("common");
  return (
    <div>
      <header className="mb-2 flex flex-wrap items-center gap-4 border-b border-border pb-6">
        <Avatar name={account.name} size="large" />
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 text-lg font-semibold tracking-tight [overflow-wrap:anywhere]">
              {account.name}
            </h2>
            <StatusBadge label={t("verifiedLabel")} tone="success" />
          </div>
          <p className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
            <MailIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="[overflow-wrap:anywhere]">{account.email}</span>
          </p>
        </div>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={busy}
          onClick={() => void onSignOut()}
        >
          <LogoutIcon aria-hidden="true" data-icon="inline-start" />
          {busy ? c("working") : c("signOut")}
        </Button>
      </header>
      {children}
    </div>
  );
}

export function AccountSkeleton() {
  const c = useTranslations("common");
  return (
    <div
      className="flex items-center gap-4 border-b border-border pb-6"
      role="status"
      aria-label={c("loading")}
    >
      <Skeleton className="size-12 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Skeleton className="h-5 w-40 max-w-full" />
        <Skeleton className="h-4 w-60 max-w-full" />
      </div>
    </div>
  );
}
