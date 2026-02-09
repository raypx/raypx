import { createFileRoute, redirect } from "@tanstack/react-router";
import { getTemplateNames } from "../lib/emails";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // Redirect to first available template
    const templates = getTemplateNames();
    const firstTemplate = templates[0];
    if (firstTemplate) {
      throw redirect({
        to: "/email/$",
        params: { _splat: firstTemplate },
        search: { viewMode: "desktop" },
      });
    }
    return null;
  },
  component: RouteComponent,
});

function RouteComponent() {
  return null; // Will redirect before rendering
}
