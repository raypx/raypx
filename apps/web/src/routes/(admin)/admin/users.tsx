import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { webPageGuard, PageAccessFeedback } from "../../../features/auth/route-guard.tsx";
import {
  SessionBoundary,
  SignInGate,
} from "../../../features/auth/components/session-boundary.tsx";
import { Users } from "../../../features/users/components/users.tsx";

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
