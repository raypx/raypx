import { useTranslations } from "../../../i18n.js";
import { createFileRoute } from "@tanstack/react-router";

import { webPageGuard, PageAccessFeedback } from "../../../features/auth/route-guard.js";
import { SessionBoundary, SignInGate } from "../../../features/auth/components/session-boundary.js";
import { Users } from "../../../features/users/components/users.js";

export const Route = createFileRoute("/(admin)/admin/users")({
  staticData: { page: { title: "common.users", layout: "workbench" } },
  beforeLoad: webPageGuard("/admin/users"),
  errorComponent: PageAccessFeedback,
  component: Page,
});
function Page() {
  const g = useTranslations("guest");
  return (
    <SessionBoundary
      guest={<SignInGate title={g("privateTitle")} description={g("privateHint")} />}
    >
      {(accountId) => <Users key={accountId} accountId={accountId} />}
    </SessionBoundary>
  );
}
