import { Button } from "@raypx/ui/components/button";
import { Image } from "@raypx/ui/components/image";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { brand } from "~/config/site";

function AuthLayoutComponent() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-muted/40 p-4 md:p-10">
      {/* Back to Home Button */}
      <Button
        asChild
        className="absolute left-4 top-4 md:left-8 md:top-8"
        size="sm"
        variant="ghost"
      >
        <Link to="/">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Link>
      </Button>

      <div className="w-full max-w-[400px] space-y-4">
        {/* Logo */}
        <div className="flex justify-center">
          <Link
            className="flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
            to="/"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Image
                alt="Raypx"
                className="object-cover"
                height={24}
                layout="fixed"
                priority
                shape="circle"
                src="/logo.png"
                width={24}
              />
            </div>
            <span className="text-xl font-bold tracking-tight">{brand.name}</span>
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
