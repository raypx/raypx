import { createFileRoute, redirect } from "@tanstack/react-router";
import { NotFound } from "~/components/not-found";
import { getUser } from "~/functions/get-user";
import { Layout } from "~/layouts/dashboard";

function AppLayout() {
  return <Layout />;
}

export const Route = createFileRoute("/dashboard")({
  loader: async () => {
    const session = await getUser();
    if (!session?.session) {
      throw redirect({
        to: "/sign-in",
        replace: true,
      });
    }
  },
  component: AppLayout,
  notFoundComponent: NotFound,
});
