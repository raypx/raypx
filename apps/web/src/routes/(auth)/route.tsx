import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Logo } from "@raypx/ui/logo";

export const Route = createFileRoute("/(auth)")({ component: AuthLayout });

function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="shrink-0 px-10 pt-8 max-[760px]:px-6">
        <Link to="/" aria-label="Raypx" className="inline-flex">
          <Logo />
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
    </div>
  );
}
