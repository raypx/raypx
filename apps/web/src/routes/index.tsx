import { createFileRoute } from "@tanstack/react-router";
import { loadAccount } from "../account";
import { AccountPage } from "../pages/account";

export const Route = createFileRoute("/")({
  loader: () => loadAccount(),
  component: function AccountRoute() {
    return <AccountPage state={Route.useLoaderData()} />;
  },
});
