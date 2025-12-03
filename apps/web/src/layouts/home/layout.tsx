import { Outlet } from "@tanstack/react-router";
import { Footer } from "~/components/layout/footer";
import { Navbar } from "~/components/layout/navbar";

export function Layout() {
  return (
    <div className="flex flex-col min-h-screen relative">
      <Navbar scroll />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
