import { Button } from "@raypx/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8">
      <Logo className="size-12" />
      <h1 className="font-bold text-4xl">404</h1>
      <p className="text-balance px-4 text-center font-medium text-xl">Page not found</p>
      <Button
        render={
          <Link className="cursor-pointer" to="/$">
            Back to Home
          </Link>
        }
        size="lg"
        variant="default"
      />
    </div>
  );
}
