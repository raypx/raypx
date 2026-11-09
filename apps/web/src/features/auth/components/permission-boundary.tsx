import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { hasPermission, type AccountPermission } from "@raypx/account/access";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { accountAccessQuery } from "../access.ts";
import { LockIcon } from "@raypx/icons/lock";
import { AlertCircleIcon } from "@raypx/icons/alert-circle";

/** Private views never mount before the server grants the page's permission. */
export function PermissionBoundary({
  accountId,
  permission,
  children,
}: {
  accountId: string;
  permission: AccountPermission;
  children: ReactNode;
}) {
  const router = useRouter();
  const query = useQuery(accountAccessQuery(accountId));
  const t = useTranslations("access");
  const c = useTranslations("common");
  if (query.isPending) return <LoadingState label={c("loading")} />;
  if (query.isError)
    return (
      <div className="flex max-w-lg flex-col items-start gap-5 py-8" role="alert">
        <AlertCircleIcon aria-hidden="true" className="size-6 text-muted-foreground" />
        <p className="text-sm leading-relaxed">{t("unavailable")}</p>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch().then(() => router.invalidate())}
        >
          {c("retry")}
        </Button>
      </div>
    );
  if (query.data.accountId !== accountId || !hasPermission(query.data, permission))
    return (
      <div role="alert" className="flex max-w-lg flex-col items-start gap-5 py-8">
        <div className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
          <LockIcon aria-hidden="true" className="size-5" />
        </div>
        <p className="text-sm leading-relaxed">{t("forbidden")}</p>
      </div>
    );
  return children;
}
