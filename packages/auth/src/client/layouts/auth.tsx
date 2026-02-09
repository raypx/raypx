import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { cn } from "@raypx/ui/lib/utils";
import type { ReactNode } from "react";

type AuthLayoutProps = {
  className?: string;
  classNames?: Record<string, string>;
  children: ReactNode;
  cardHeader?: ReactNode;
  description?: string;
  title?: string;
  cardFooter?: ReactNode;
};

export function AuthLayout({
  className,
  classNames,
  children,
  cardHeader,
  description,
  title,
  cardFooter,
}: AuthLayoutProps) {
  return (
    <Card className={cn("w-full max-w-sm", className, classNames?.base)}>
      <CardHeader className={classNames?.header}>
        {cardHeader ? (
          cardHeader
        ) : (
          <>
            <CardTitle className={cn("text-lg md:text-xl", classNames?.title)}>{title}</CardTitle>
            {description && (
              <CardDescription className={cn("text-xs md:text-sm", classNames?.description)}>
                {description}
              </CardDescription>
            )}
          </>
        )}
      </CardHeader>
      <CardContent className={cn("grid gap-6", classNames?.content)}>{children}</CardContent>
      {cardFooter && (
        <CardFooter className="justify-center gap-1.5 text-muted-foreground text-sm">
          {cardFooter}
        </CardFooter>
      )}
    </Card>
  );
}
