import { createFileRoute, redirect } from "@tanstack/react-router";
import { WebShell } from "../../components/web-shell";
import { ensureAccount } from "../../features/auth/account";

// Signed-in surface: the sidebar shell and its account/task dependencies stay out of (auth).
export const Route = createFileRoute("/(app)")({
  beforeLoad: async () => {
    const account = await ensureAccount();
    // An unavailable API still renders the pages so they can show the network error and retry.
    if (account.status === "signed-out") throw redirect({ to: "/login", replace: true });
    return { account };
  },
  component: WebShell,
});
