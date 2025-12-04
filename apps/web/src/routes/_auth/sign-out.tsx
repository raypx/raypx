import { createAuthRouteBeforeLoad, SignOutPage } from "@raypx/auth";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/sign-out")({
  beforeLoad: createAuthRouteBeforeLoad("/sign-in"),
  component: SignOutPage,
});
