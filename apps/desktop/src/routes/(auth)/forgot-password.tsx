import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../features/auth/components/form.tsx";

export const Route = createFileRoute("/(auth)/forgot-password")({
  component: () => <AuthForm mode="forgot-password" />,
});
