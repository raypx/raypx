import { createFileRoute } from "@tanstack/react-router";
import { accountQuery } from "../../features/auth/account-query";
import { webPageGuard, PageAccessFeedback } from "../../features/auth/route-guard";
import { AdminShell } from "../../components/admin-shell";

export const Route = createFileRoute("/(admin)")({
  beforeLoad: async ({ context, location }) => {
    const account = await context.queryClient.fetchQuery(accountQuery());
    await webPageGuard("/admin")({ context: { ...context, account }, location });
    return { account };
  },
  errorComponent: PageAccessFeedback,
  component: AdminShell,
});
