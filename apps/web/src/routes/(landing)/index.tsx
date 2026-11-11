import { createFileRoute } from "@tanstack/react-router";
import { LandingHome } from "../../features/landing/components/home.js";

export const Route = createFileRoute("/(landing)/")({
  component: LandingHome,
});
