import { createFileRoute } from "@tanstack/react-router";
import { WebShell } from "../../components/shell";
import { accountQuery } from "../../features/auth/account-query";

// Public application shell. Private features resolve their own session boundary.
export const Route = createFileRoute("/(app)")({
  beforeLoad: async ({ context }) => {
    const account = await context.queryClient.fetchQuery(accountQuery());
    // An unavailable API still renders the pages so they can show the network error and retry.
    return { account };
  },
  component: WebShell,
});
