import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";

function HomeLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar scroll />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export const Route = createFileRoute("/_home")({
  component: HomeLayout,
});
