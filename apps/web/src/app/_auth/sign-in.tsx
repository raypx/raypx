import { auth } from "@raypx/auth";
import { Button } from "@raypx/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";

function SignInPage() {
  const onSignIn = async () => {
    await auth.signIn.social({
      provider: "github",
    });
  };
  return (
    <div>
      <Button onClick={onSignIn}>Sign in with GitHub</Button>
    </div>
  );
}

export const Route = createFileRoute("/_auth/sign-in")({
  component: SignInPage,
});
