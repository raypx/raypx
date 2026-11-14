import { useTranslations } from "../../../i18n.js";
import { webPageGuard, PageAccessFeedback } from "../../../features/auth/route-guard.js";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { SessionBoundary, SignInGate } from "../../../features/auth/components/session-boundary.js";

import { ConfigurationSettings } from "../../../features/config/components/settings.js";

export const Route = createFileRoute("/(admin)/admin/settings")({
  beforeLoad: webPageGuard("/admin/settings"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "site.title", layout: "document" } },
  component: Page,
});
function Page() {
  const hash = useLocation({ select: (location) => location.hash });
  const g = useTranslations("guest");
  return (
    <SessionBoundary
      guest={<SignInGate title={g("privateTitle")} description={g("privateHint")} />}
    >
      {() => (
        <ConfigurationSettings
          initialTab={hash === "setup" || hash === "email" ? "resend" : "site"}
          setup={hash === "setup"}
        />
      )}
    </SessionBoundary>
  );
}
