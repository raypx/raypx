import { createFileRoute } from "@tanstack/react-router";
import { LocalHome } from "../../features/onboarding/home";
export const Route = createFileRoute("/(local)/")({
  staticData: { page: { title: "common.projects", layout: "workbench" } },
  component: LocalHome,
});
