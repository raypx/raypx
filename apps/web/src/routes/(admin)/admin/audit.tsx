import { createFileRoute } from "@tanstack/react-router";
import { webPageGuard, PageAccessFeedback } from "../../../features/auth/route-guard";
import { AuditLog } from "../../../features/administration/components/audit-log";
export const Route = createFileRoute("/(admin)/admin/audit")({
  beforeLoad: webPageGuard("/admin/audit"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "administration.nav.auditLog", layout: "workbench" } },
  component: AuditLog,
});
