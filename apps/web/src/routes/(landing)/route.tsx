import { createFileRoute } from "@tanstack/react-router";
import { LandingLayout } from "../../features/landing/components/layout.js";

export const Route = createFileRoute("/(landing)")({
  component: LandingLayout,
});
