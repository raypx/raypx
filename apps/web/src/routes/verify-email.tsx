import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "../pages/auth";

export const Route = createFileRoute("/verify-email")({
  component: () => <AuthPage mode="verify-email" />,
});
