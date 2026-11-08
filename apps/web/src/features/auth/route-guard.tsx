import type { AccountState } from "@raypx/account";
import { hasPermission } from "@raypx/account/access";
import type { QueryClient } from "@tanstack/react-query";
import { redirect, useRouter } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { accountAccessQuery, webPages, type WebPath } from "./access.ts";
import { safeReturnTo } from "./return-to.ts";

class PageAccessError extends Error {
  constructor(readonly reason: "forbidden" | "unavailable") {
    super(reason === "forbidden" ? "FORBIDDEN" : "ACCESS_UNAVAILABLE");
  }
}

/** Guests retain their public workspace; signed-in private views need fresh grants. */
export function webPageGuard(path: WebPath) {
  return async ({
    context,
    location,
  }: {
    context: { queryClient: QueryClient; account: AccountState };
    location: { href: string };
  }) => {
    const policy = webPages[path];
    if (context.account.status === "signed-out") {
      if (!policy.guest)
        throw redirect({ to: "/login", search: { returnTo: safeReturnTo(location.href) } });
      return;
    }
    if (!policy.permission) return;
    if (context.account.status === "unavailable") throw new PageAccessError("unavailable");
    const accountId = context.account.account.id;
    let access;
    try {
      access = await context.queryClient.fetchQuery(accountAccessQuery(accountId));
    } catch {
      throw new PageAccessError("unavailable");
    }
    if (access.accountId !== accountId || !hasPermission(access, policy.permission))
      throw new PageAccessError("forbidden");
  };
}

export function PageAccessFeedback({ error }: { error: unknown }) {
  const t = useTranslations("access");
  const c = useTranslations("common");
  const router = useRouter();
  // SSR serializers preserve Error.message but may discard custom properties.
  const reason =
    error instanceof PageAccessError
      ? error.reason
      : error instanceof Error && error.message === "FORBIDDEN"
        ? "forbidden"
        : "unavailable";
  return (
    <div className="flex flex-col items-start gap-4 py-8">
      <p role="alert">{t(reason)}</p>
      <Button variant="outline" onClick={() => void router.invalidate()}>
        {c("retry")}
      </Button>
    </div>
  );
}
