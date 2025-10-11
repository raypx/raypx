"use client";

import { Link as TanStackLink } from "@tanstack/react-router";
import type { ForwardedRef } from "react";
import { forwardRef } from "react";

export type LinkProps = {
  /**
   * The href to navigate to
   */
  href: string;
  /**
   * Whether to open the link in a new tab
   */
  external?: boolean;
  /**
   * Custom className for styling
   */
  className?: string;
  /**
   * Children to render inside the link
   */
  children: React.ReactNode;
  /**
   * Additional props for the link element
   */
  [key: string]: any;
};

/**
 * Link component that wraps TanStack Router Link with additional functionality
 *
 * @example
 * ```tsx
 * <Link href="/dashboard">Dashboard</Link>
 * <Link href="https://example.com" external>External Link</Link>
 * ```
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ external, className, children, href, ...props }, ref: ForwardedRef<HTMLAnchorElement>) => {
    // External links
    if (external || (typeof href === "string" && href.startsWith("http"))) {
      return (
        <a
          className={className}
          href={href}
          ref={ref}
          rel="noopener noreferrer"
          target="_blank"
          {...props}
        >
          {children}
        </a>
      );
    }

    // Internal links using TanStack Router Link
    return (
      <TanStackLink className={className} ref={ref} to={href} {...props}>
        {children}
      </TanStackLink>
    );
  },
);

Link.displayName = "Link";
