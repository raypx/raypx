import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";

function DocsLayout() {
  return (
    <RootProvider
      theme={{
        enabled: false,
      }}
    >
      <Outlet />
    </RootProvider>
  );
}

export const Route = createFileRoute("/docs")({
  component: DocsLayout,
});
