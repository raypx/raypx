import { Image } from "@raypx/ui/components/image";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

function AuthLayoutComponent() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-4 md:p-10">
      <div className="w-full max-w-[400px] space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center text-center">
          <Link className="mb-4 transition-transform hover:scale-105 active:scale-95" to="/">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Image
                alt="Raypx"
                className="object-cover"
                height={32}
                layout="fixed"
                priority
                shape="circle"
                src="/logo.png"
                width={32}
              />
            </div>
          </Link>
        </div>

        {/* Page Content */}
        <Outlet />

        {/* Footer Links */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <a className="hover:text-foreground transition-colors" href="/terms">
            Terms
          </a>
          <a className="hover:text-foreground transition-colors" href="/privacy">
            Privacy
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_auth")({
  component: AuthLayoutComponent,
});
