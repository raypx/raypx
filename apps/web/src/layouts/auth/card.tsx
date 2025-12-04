import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Card as UICard,
} from "@raypx/ui/components/card";
import type { ReactNode } from "react";

interface AuthCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <UICard className="sm:border sm:shadow-sm sm:bg-card sm:rounded-xl sm:p-8">
      {(title || description) && (
        <CardHeader className="flex flex-col space-y-1.5 text-center px-0 pt-0">
          {title && (
            <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </CardTitle>
          )}
          {description && (
            <CardDescription className="text-sm text-muted-foreground">
              {description}
            </CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className="px-0 py-4 grid gap-6">{children}</CardContent>
      {footer && (
        <CardFooter className="justify-center gap-1.5 text-muted-foreground text-sm px-0 pb-0">
          {footer}
        </CardFooter>
      )}
    </UICard>
  );
}
