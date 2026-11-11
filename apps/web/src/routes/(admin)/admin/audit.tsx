import { createFileRoute } from "@tanstack/react-router";
import { webPageGuard, PageAccessFeedback } from "../../../features/auth/route-guard.js";
import { AuditLog } from "../../../features/administration/components/audit-log.js";
export const Route = createFileRoute("/(admin)/admin/audit")({
  beforeLoad: webPageGuard("/admin/audit"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "dash.nav.audit", layout: "workbench" } },
  component: AuditLog,
});
