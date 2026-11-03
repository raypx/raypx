import { useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { hasPermission, type AccountPermission } from "@raypx/account/access";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { accountAccessQuery } from "../access";

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
      <div className="flex flex-col items-start gap-4 py-8">
        <p role="alert">{t("unavailable")}</p>
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
      <p role="alert" className="py-8">
        {t("forbidden")}
      </p>
    );
  return children;
}
