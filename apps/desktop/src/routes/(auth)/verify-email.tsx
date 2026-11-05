import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "../../features/auth/components/form.tsx";

export const Route = createFileRoute("/(auth)/verify-email")({
  component: () => <AuthForm mode="verify-email" />,
});
