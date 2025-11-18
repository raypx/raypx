import { Button } from "@raypx/ui/components/button";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";
import { Logo } from "./layout/logo";

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
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-6 p-6">
      <Logo className="size-12" />
      <h1 className="text-6xl font-bold">404</h1>
      <p className="text-xl text-muted-foreground">Page not found</p>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Go Home
          </Link>
        </Button>
        <Button onClick={handleGoBack} size="lg" variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    </div>
  );
}
