import { createFileRoute } from "@tanstack/react-router";

function SignInPage() {
  return <div>Hello "/(auth)/sign-in"!</div>;
}

export const Route = createFileRoute("/_auth/sign-in")({
  component: SignInPage,
});
