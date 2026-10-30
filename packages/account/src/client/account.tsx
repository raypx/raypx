import type { ComponentType, ReactNode } from "react";
import { ArrowRight, CircleCheck, CircleUserRound } from "lucide-react";
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
      <CircleUserRound className="mb-5 text-muted-foreground" size={48} strokeWidth={1} />
      <h2 className="text-[22px]">{t("signedOut")}</h2>
      <p className="mt-2.5 mb-7 max-w-[52ch] text-muted-foreground">{t("signedOutIntro")}</p>
      <div className="flex flex-wrap items-center gap-5">
        <LinkComponent
          to="login"
          className="inline-flex min-h-[38px] items-center gap-2.5 rounded-lg bg-primary px-[15px] font-medium text-primary-foreground hover:opacity-85"
        >
          {c("signIn")}
          <ArrowRight size={16} />
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
      <div className="mb-9 flex items-center gap-4">
        <span className="grid size-13.5 place-items-center rounded-full border border-border bg-muted text-[22px]">
          {account.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h2>{account.name}</h2>
          <p className="mt-0.75 text-muted-foreground">{account.email}</p>
        </div>
      </div>
      <dl className="mb-7 [&>div]:flex [&>div]:items-center [&>div]:gap-6 [&>div]:border-t [&>div]:border-border [&>div]:py-4.5 [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere] [&_dt]:w-32.5 [&_dt]:text-muted-foreground @max-sm/main:[&>div]:flex-col @max-sm/main:[&>div]:items-start @max-sm/main:[&>div]:gap-1.75">
        <div>
          <dt>{t("name")}</dt>
          <dd>{account.name}</dd>
        </div>
        <div>
          <dt>{t("email")}</dt>
          <dd>{account.email}</dd>
        </div>
        <div>
          <dt>{c("status")}</dt>
          <dd>
            <span className="inline-flex items-center gap-1.5">
              <CircleCheck size={16} />
              {t("verifiedLabel")}
            </span>
          </dd>
        </div>
      </dl>
      {children}
      <Button variant="outline" disabled={busy} onClick={() => void onSignOut()}>
        {busy ? c("working") : c("signOut")}
      </Button>
    </div>
  );
}

export function AccountSkeleton() {
  const c = useTranslations("common");
  return (
    <div className="flex flex-col gap-4" role="status" aria-label={c("loading")}>
      <span className="size-13.5 rounded-full bg-muted motion-safe:animate-pulse" />
      <span className="h-4.5 w-full max-w-75 rounded-[5px] bg-muted motion-safe:animate-pulse" />
      <span className="h-4.5 w-45 rounded-[5px] bg-muted motion-safe:animate-pulse" />
    </div>
  );
}
