import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../features/auth/components/form";

export const Route = createFileRoute("/(auth)/reset-password")({
  component: () => <AuthForm mode="reset-password" />,
});
