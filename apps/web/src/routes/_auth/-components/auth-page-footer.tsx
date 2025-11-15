import { cn } from "@raypx/shared/utils";
import { Button } from "@raypx/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { AuthPageFooterType } from "../-hooks/use-auth-page-config";

/**
 * Factory function to generate auth page footer based on type
 *
 * @param footerType - The type of footer to render
 * @returns ReactNode for the footer content
 */
export function getAuthPageFooter(footerType?: AuthPageFooterType): ReactNode {
  // If custom ReactNode is provided, return it directly
  if (footerType && typeof footerType !== "string") {
    return footerType;
  }

  switch (footerType) {
    case "sign-in":
      return (
        <>
          Don't have an account?
          <Link className={cn("text-foreground underline")} to="/sign-up">
            <Button className={cn("px-0 text-foreground underline")} size="sm" variant="link">
              Sign Up
            </Button>
          </Link>
        </>
      );

    case "sign-up":
      return (
        <>
          Already have an account?
          <Link className={cn("text-foreground underline")} to="/sign-in">
            <Button className={cn("px-0 text-foreground underline")} size="sm" variant="link">
              Sign In
            </Button>
          </Link>
        </>
      );

    case "go-back":
      return (
        <>
          <ArrowLeft className="size-3" />
          <Button
            className={cn("px-0 text-foreground underline")}
            onClick={() => window.history.back()}
            size="sm"
            variant="link"
          >
            Go Back
          </Button>
        </>
      );

    case "none":
      return null;

    default:
      return null;
  }
}
