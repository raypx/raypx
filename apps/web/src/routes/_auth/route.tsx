import { Image } from "@raypx/ui/components/image";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

function AuthLayoutComponent() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="z-10 flex w-full max-w-sm flex-col gap-6">
        <Link className="flex items-center gap-2 self-center font-medium" to="/">
          <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full text-primary-foreground">
            <Image alt="Raypx" className="object-cover" height={24} src="/logo.png" width={24} />
          </div>
          Raypx
        </Link>
        <Outlet />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_auth")({
  component: AuthLayoutComponent,
});
