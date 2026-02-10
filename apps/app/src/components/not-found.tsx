import { Button } from "@raypx/ui/components/button";
import { IconArrowLeft, IconHome, IconSearch } from "@tabler/icons-react";
import { Link, useRouter } from "@tanstack/react-router";
import { links } from "~/config/site";

export function NotFound() {
  const router = useRouter();

  const handleGoBack = () => {
    if (router.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background p-6 md:p-8">
      {/* Abstract Background Elements */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] size-[500px] rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute right-[-10%] bottom-[-20%] size-[500px] rounded-full bg-purple-500/5 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 size-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        {/* Animated Icon */}
        <div className="mb-8 flex size-24 items-center justify-center rounded-3xl bg-muted/50 shadow-inner ring-1 ring-border/50">
          <IconSearch className="size-10 animate-pulse text-muted-foreground" />
        </div>

        <div className="mb-8 space-y-4">
          {/* Glitch Effect Text */}
          <div className="relative">
            <h1 className="select-none font-black text-8xl text-primary/20 tracking-tighter">
              404
            </h1>
            <h1 className="absolute inset-0 animate-pulse font-black text-8xl text-foreground tracking-tighter">
              404
            </h1>
          </div>

          <h2 className="font-semibold text-2xl tracking-tight">Page not found</h2>
          <p className="text-muted-foreground">
            Sorry, we couldn't find the page you're looking for. It might have been removed,
            renamed, or doesn't exist.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            className="group w-full sm:w-auto"
            render={
              <Link to="/">
                <IconHome className="mr-2 size-4 transition-transform group-hover:-translate-y-0.5" />
                Back to Home
              </Link>
            }
            size="lg"
          />
          <Button
            className="group w-full sm:w-auto"
            onClick={handleGoBack}
            size="lg"
            variant="outline"
          >
            <IconArrowLeft className="mr-2 size-4 transition-transform group-hover:-translate-x-0.5" />
            Go Back
          </Button>
        </div>

        {/* Footer Links */}
        <div className="mt-12 flex items-center justify-center gap-6 text-muted-foreground text-sm">
          <Link className="transition-colors hover:text-foreground" to={links.docs}>
            Documentation
          </Link>
          <span className="h-4 w-px bg-border" />
          <Link className="transition-colors hover:text-foreground" to={links.contact}>
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
