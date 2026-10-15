import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../features/auth/components/auth-form";

export const Route = createFileRoute("/reset-password")({
  component: () => <AuthForm mode="reset-password" />,
});
