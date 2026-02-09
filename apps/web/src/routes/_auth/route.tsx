import { Button } from "@raypx/ui/components/button";
import { Image } from "@raypx/ui/components/image";
import { IconArrowLeft } from "@tabler/icons-react";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { brand } from "~/config/site";
import { getUser } from "~/functions/get-user";

function AuthLayoutComponent() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-muted/40 p-4 md:p-10">
      {/* Back to Home Button */}

      <Link to="/">
        <Button className="absolute top-4 left-4 md:top-8 md:left-8" size="sm" variant="ghost">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </Link>

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
            <span className="font-bold text-xl tracking-tight">{brand.name}</span>
          </Link>
        </div>

        {/* Page Content */}
        <Outlet />

        {/* Footer Links */}
        <div className="flex items-center justify-center gap-4 text-muted-foreground text-xs">
          <a className="transition-colors hover:text-foreground" href="/terms">
            Terms
          </a>
          <a className="transition-colors hover:text-foreground" href="/privacy">
            Privacy
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_auth")({
  loader: async ({ location }) => {
    const session = await getUser();
    if (location.pathname !== "/sign-out" && session?.session) {
      throw redirect({
        to: "/dashboard",
        replace: true,
      });
    }
  },
  component: AuthLayoutComponent,
});
