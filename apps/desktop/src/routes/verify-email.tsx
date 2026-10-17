import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../features/auth/components/form";

export const Route = createFileRoute("/verify-email")({
  component: () => <AuthForm mode="verify-email" />,
});
