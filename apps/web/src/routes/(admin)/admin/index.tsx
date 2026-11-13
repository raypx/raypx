import { createFileRoute } from "@tanstack/react-router";
import { Overview } from "../../../features/admin/components/overview.js";
export const Route = createFileRoute("/(admin)/admin/")({
  staticData: { page: { title: "dash.nav.overview", layout: "workbench" } },
  component: Overview,
});
