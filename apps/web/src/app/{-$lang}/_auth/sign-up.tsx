import { createFileRoute } from "@tanstack/react-router";

function SignUpPage() {
  return <div>Hello "/(auth)/sign-up"!</div>;
}

export const Route = createFileRoute("/{-$lang}/_auth/sign-up")({
  component: SignUpPage,
});
