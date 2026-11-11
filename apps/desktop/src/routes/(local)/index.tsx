import { createFileRoute } from "@tanstack/react-router";
import { LocalHome } from "../../features/onboarding/home.js";
export const Route = createFileRoute("/(local)/")({
  staticData: { page: { title: "common.projects", layout: "workbench" } },
  component: LocalHome,
});
