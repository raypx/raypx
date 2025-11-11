import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import appCss from "@/styles/mdx.css?url";

function DocsLayout() {
  return (
    <RootProvider>
      <Outlet />
    </RootProvider>
  );
}

export const Route = createFileRoute("/docs")({
  component: DocsLayout,
  head: async () => ({
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
});
