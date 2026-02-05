import { createFileRoute, redirect } from "@tanstack/react-router";
import { defaultLocale } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  component: RouteComponent,
  loader: async () => {
    throw redirect({
      to: "/$locale",
      params: { locale: defaultLocale },
    });
  },
});

function RouteComponent() {
  return <div>Hello "/"!</div>;
}
