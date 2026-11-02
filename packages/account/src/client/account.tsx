import type { ComponentType, ReactNode } from "react";
import { ArrowRightIcon } from "@raypx/icons/arrow-right";
import { CheckCircleIcon } from "@raypx/icons/check-circle";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { LogoutIcon } from "@raypx/icons/logout";
import { Button } from "@raypx/ui/components/ui/button";
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
      <div className="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-border p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full border border-border bg-muted text-lg font-medium">
          {account.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate">{account.name}</h2>
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="truncate">{account.email}</span>
            <span className="inline-flex items-center gap-1 text-xs">
              <CheckCircleIcon aria-hidden="true" size={14} />
              {t("verifiedLabel")}
            </span>
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void onSignOut()}>
          <LogoutIcon aria-hidden="true" />
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
