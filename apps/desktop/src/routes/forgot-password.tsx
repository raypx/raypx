import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../features/auth/components/form";

export const Route = createFileRoute("/forgot-password")({
  component: () => <AuthForm mode="forgot-password" />,
});
