import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "../../components/sidebar";

/**
 * Layout route for email preview pages
 * Provides the sidebar and main content area structure
 */
export const Route = createFileRoute("/email")({
  component: EmailLayout,
});

function EmailLayout() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col bg-background">
        <Outlet />
      </main>
    </div>
  );
}
