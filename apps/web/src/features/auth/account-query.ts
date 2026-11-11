import { queryOptions } from "@tanstack/react-query";
import { loadAccount } from "./account.js";

/** Account projection for route guards and identity-scoped settings reads. */
export function accountQuery() {
  return queryOptions({
    queryKey: ["account"],
    queryFn: () => loadAccount(),
    // A navigation must observe expiry or an account switch, even in a long-lived tab.
    staleTime: 0,
  });
}
