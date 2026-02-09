import { cn } from "@raypx/ui/lib/utils";
import { Body, Container, Head, Html, Preview, Section, Tailwind } from "@react-email/components";
import type { ReactNode } from "react";
import { EmailFooter } from "./footer";
import { EmailHeader } from "./header";

/**
 * Props for the email footer component
 */
type EmailLayoutFooterProps = {
  /** Show footer */
  show?: boolean;
  /** Brand name */
  brandName?: string;
  /** Company address */
  address?: string;
  /** Support email */
  supportEmail?: string;
  /** Website URL */
  websiteUrl?: string;
  /** Social media links */
  socialLinks?: {
    twitter?: string;
    github?: string;
    linkedin?: string;
  };
  /** Unsubscribe URL */
  unsubscribeUrl?: string;
  /** Show unsubscribe link */
  showUnsubscribe?: boolean;
};

/**
 * Props for the email header component
 */
type EmailLayoutHeaderProps = {
  /** Show header */
  show?: boolean;
  /** Brand name to display */
  brandName?: string;
  /** Logo URL */
  logoUrl?: string;
  /** Website URL for the logo link */
  websiteUrl?: string;
};

/**
 * Props for the email layout component
 */
type EmailLayoutProps = {
  /** Email preview text shown in email clients */
  preview: string;
  /** Email content to be rendered inside the layout */
  children: ReactNode;
  /** Header configuration */
  header?: EmailLayoutHeaderProps;
  /** Footer configuration */
  footer?: EmailLayoutFooterProps;
  /** Maximum width of the email container */
  maxWidth?: "sm" | "md" | "lg";
};

const maxWidthClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-xl",
};

/**
 * Base email layout component that provides consistent styling
 * and structure for all email templates
 */
export const EmailLayout = ({
  preview,
  children,
  header = { show: true },
  footer = { show: true },
  maxWidth = "lg",
}: EmailLayoutProps) => (
  <Html>
    <Head />
    <Preview>{preview}</Preview>
    <Tailwind
      config={{
        theme: {
          extend: {
            colors: {
              primary: {
                DEFAULT: "#1a1a1a",
                foreground: "#fafafa",
                50: "#f7f7f7",
                100: "#e8e8e8",
                200: "#d1d1d1",
                300: "#b4b4b4",
                400: "#999999",
                500: "#7a7a7a",
                600: "#5c5c5c",
                700: "#474747",
                800: "#333333",
                900: "#1a1a1a",
                950: "#0a0a0a",
              },
              secondary: {
                DEFAULT: "#f7f7f7",
                foreground: "#1a1a1a",
              },
              muted: {
                DEFAULT: "#f7f7f7",
                foreground: "#7a7a7a",
              },
              border: "#e3e3e3",
              background: "#ffffff",
              foreground: "#1a1a1a",
            },
          },
        },
      }}
    >
      <Body className="bg-gray-50 font-sans">
        <Container className={cn("mx-auto px-4 py-8", maxWidthClasses[maxWidth])}>
          {header?.show && (
            <EmailHeader
              brandName={header.brandName}
              logoUrl={header.logoUrl}
              websiteUrl={header.websiteUrl}
            />
          )}
          <Section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {children}
          </Section>
          {footer?.show && (
            <EmailFooter
              address={footer.address}
              brandName={footer.brandName}
              showUnsubscribe={footer.showUnsubscribe}
              socialLinks={footer.socialLinks}
              supportEmail={footer.supportEmail}
              unsubscribeUrl={footer.unsubscribeUrl}
              websiteUrl={footer.websiteUrl}
            />
          )}
        </Container>
      </Body>
    </Tailwind>
  </Html>
);
