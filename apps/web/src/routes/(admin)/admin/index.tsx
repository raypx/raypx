import { createFileRoute } from "@tanstack/react-router";
import { Overview } from "../../../features/administration/components/overview";
export const Route = createFileRoute("/(admin)/admin/")({
  staticData: { page: { title: "administration.nav.overview", layout: "workbench" } },
  component: Overview,
});
