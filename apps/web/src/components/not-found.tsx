import { Button } from "@raypx/ui/components/button";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Home, SearchX } from "lucide-react";
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
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] size-[500px] rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-10%] size-[500px] rounded-full bg-purple-500/5 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[800px] rounded-full bg-background/80 backdrop-blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        {/* Animated Icon */}
        <div className="mb-8 flex size-24 items-center justify-center rounded-3xl bg-muted/50 shadow-inner ring-1 ring-border/50">
          <SearchX className="size-10 text-muted-foreground animate-pulse" />
        </div>

        <div className="mb-8 space-y-4">
          {/* Glitch Effect Text */}
          <div className="relative">
            <h1 className="text-8xl font-black tracking-tighter text-primary/20 select-none">
              404
            </h1>
            <h1 className="absolute inset-0 text-8xl font-black tracking-tighter text-foreground animate-pulse">
              404
            </h1>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Page not found</h2>
          <p className="text-muted-foreground">
            Sorry, we couldn't find the page you're looking for. It might have been removed,
            renamed, or doesn't exist.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="w-full sm:w-auto group" size="lg">
            <Link to="/">
              <Home className="mr-2 size-4 group-hover:-translate-y-0.5 transition-transform" />
              Back to Home
            </Link>
          </Button>
          <Button
            className="w-full sm:w-auto group"
            onClick={handleGoBack}
            size="lg"
            variant="outline"
          >
            <ArrowLeft className="mr-2 size-4 group-hover:-translate-x-0.5 transition-transform" />
            Go Back
          </Button>
        </div>

        {/* Footer Links */}
        <div className="mt-12 flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <Link className="hover:text-foreground transition-colors" to={links.docs}>
            Documentation
          </Link>
          <span className="h-4 w-px bg-border" />
          <Link className="hover:text-foreground transition-colors" to={links.contact}>
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
