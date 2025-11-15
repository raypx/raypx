import { SignOutPage } from "@raypx/auth";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/sign-out")({
  component: SignOutPage,
});
