import { createFileRoute } from "@tanstack/react-router";
import { BrowserLogin } from "../../features/auth/components/browser-login.js";

export const Route = createFileRoute("/(auth)/login")({ component: LoginPage });

function LoginPage() {
  const { returnTo } = Route.useSearch();
  return <BrowserLogin returnTo={returnTo ?? "/"} />;
}
