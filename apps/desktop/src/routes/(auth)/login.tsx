import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../features/auth/components/form";

export const Route = createFileRoute("/(auth)/login")({
  component: () => <AuthForm mode="login" />,
});
