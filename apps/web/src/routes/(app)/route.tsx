import { createFileRoute, redirect } from "@tanstack/react-router";
import { WebShell } from "../../components/web-shell";
import { accountQuery } from "../../features/auth/account-query";

// Signed-in surface: the sidebar shell and its account/task dependencies stay out of (auth).
export const Route = createFileRoute("/(app)")({
  beforeLoad: async ({ context }) => {
    const account = await context.queryClient.fetchQuery(accountQuery());
    // An unavailable API still renders the pages so they can show the network error and retry.
    if (account.status === "signed-out") throw redirect({ to: "/login", replace: true });
    return { account };
  },
  component: WebShell,
});
