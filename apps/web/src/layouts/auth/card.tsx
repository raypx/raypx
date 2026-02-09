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
    <UICard className="sm:rounded-xl sm:border sm:bg-card sm:p-8 sm:shadow-sm">
      {(title || description) && (
        <CardHeader className="flex flex-col space-y-1.5 px-0 pt-0 text-center">
          {title && (
            <CardTitle className="font-semibold text-2xl text-foreground tracking-tight">
              {title}
            </CardTitle>
          )}
          {description && (
            <CardDescription className="text-muted-foreground text-sm">
              {description}
            </CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className="grid gap-6 px-0 py-4">{children}</CardContent>
      {footer && (
        <CardFooter className="mb-4 justify-center gap-1.5 bg-transparent px-0 pb-0 text-muted-foreground text-sm">
          {footer}
        </CardFooter>
      )}
    </UICard>
  );
}
