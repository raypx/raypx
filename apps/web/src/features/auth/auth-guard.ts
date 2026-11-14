import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { accountQuery } from "./account-query.js";
import { safeReturnTo } from "./return-to.js";

export async function authPageGuard({
  context,
  location,
}: {
  context: { queryClient: QueryClient };
  location: { pathname: string; searchStr: string };
}) {
  const pathname = location.pathname.toLowerCase().replace(/\/+$/, "");
  if (pathname !== "/login" && pathname !== "/signup") return { completeSignIn: false };
  const search = new URLSearchParams(location.searchStr);
  // The callback owns refresh failures and callback completion, including explicit retries.
  if (search.has("oauth") || search.has("error")) return { completeSignIn: false };
  const account = await context.queryClient.fetchQuery(accountQuery());
  if (account.status !== "signed-in") return { completeSignIn: false };
  const returnTo = search.has("returnTo") ? safeReturnTo(search.get("returnTo")) : "/agents";
  throw redirect({ to: returnTo, replace: true });
}
