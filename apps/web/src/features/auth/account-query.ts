import { queryOptions } from "@tanstack/react-query";
import { loadAccount } from "./account";

/** The account behind the `(app)` guard and account page, cached per QueryClient. */
export function accountQuery() {
  return queryOptions({
    queryKey: ["account"],
    queryFn: () => loadAccount(),
    // Reuse a signed-in account across navigations; re-read signed-out and unavailable states.
    staleTime: (query) => (query.state.data?.status === "signed-in" ? Infinity : 0),
  });
}
