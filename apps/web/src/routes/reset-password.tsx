import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "../pages/auth";

export const Route = createFileRoute("/reset-password")({
  component: () => <AuthPage mode="reset-password" />,
});
