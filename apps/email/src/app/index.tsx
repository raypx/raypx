import { createFileRoute } from "@tanstack/react-router";
import { EmailPreview } from "../components/email-preview";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <EmailPreview />;
}
