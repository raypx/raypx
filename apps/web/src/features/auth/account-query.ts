import { queryOptions } from "@tanstack/react-query";
import { loadAccount } from "./account";

/** The account behind the `(app)` guard and account page, cached per QueryClient. */
export function accountQuery() {
  return queryOptions({
    queryKey: ["account"],
    queryFn: () => loadAccount(),
    // A navigation must observe expiry or an account switch, even in a long-lived tab.
    staleTime: 0,
  });
}
