import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../features/auth/components/auth-form";

export const Route = createFileRoute("/(auth)/signup")({
  component: () => <AuthForm mode="signup" />,
});
