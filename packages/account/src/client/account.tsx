import type { ComponentType, ReactNode } from "react";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { MailIcon } from "@raypx/icons/mail";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { LogoutIcon } from "@raypx/icons/logout";
import { Button } from "@raypx/ui/components/ui/button";
import { Avatar } from "@raypx/ui/avatar";
import { StatusBadge } from "@raypx/ui/status-badge";
import { useTranslations } from "@raypx/i18n/browser";
import type { AccountProfile } from "../index";

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
    <div className="py-8">
      <UserCircleIcon className="mb-5 text-muted-foreground" size={48} strokeWidth={1} />
      <h2 className="text-[22px]">{t("signedOut")}</h2>
      <p className="mt-2.5 mb-7 max-w-[52ch] text-muted-foreground">{t("signedOutIntro")}</p>
      <div className="flex flex-wrap items-center gap-5">
        <LinkComponent
          to="login"
          className="inline-flex min-h-[38px] items-center gap-2.5 rounded-lg bg-primary px-[15px] font-medium text-primary-foreground hover:opacity-85"
        >
          {c("signIn")}
          <ArrowRightIcon size={16} />
        </LinkComponent>
        <LinkComponent
          to="signup"
          className="font-medium underline decoration-border underline-offset-4 hover:decoration-current"
        >
          {t("create")}
        </LinkComponent>
      </div>
    </div>
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
      <div className="mb-5 flex flex-wrap items-start gap-4 rounded-xl border border-border bg-background p-5">
        <Avatar name={account.name} size="large" />
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">
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
      </div>
      {children}
    </div>
  );
}

export function AccountSkeleton() {
  const c = useTranslations("common");
  return (
    <div className="flex flex-col gap-4" role="status" aria-label={c("loading")}>
      <span className="size-12 rounded-full bg-muted motion-safe:animate-pulse" />
      <span className="h-4.5 w-full max-w-75 rounded-[5px] bg-muted motion-safe:animate-pulse" />
      <span className="h-4.5 w-45 rounded-[5px] bg-muted motion-safe:animate-pulse" />
    </div>
  );
}
