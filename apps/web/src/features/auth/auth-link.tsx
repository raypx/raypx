import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@voidmix/ui/components/ui/button";

/** Keep the validated destination through every step of the authentication flow. */
export function AuthLink({
  to = "/login",
  next,
  button = false,
  children,
  className,
}: {
  to?: "/login" | "/signup" | "/reset-password";
  next: string | undefined;
  button?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const link = <Link to={to} {...(next ? { search: { redirect: next } } : {})} />;
  return button ? (
    <Button className="w-full" nativeButton={false} render={link} size="lg">
      {children}
    </Button>
  ) : (
    <Link
      to={to}
      {...(next ? { search: { redirect: next } } : {})}
      className={className ?? "font-medium text-foreground hover:underline"}
    >
      {children}
    </Link>
  );
}
