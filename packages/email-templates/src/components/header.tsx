import { Container, Link, Text } from "@react-email/components";

/**
 * Props for the email header component
 */
type EmailHeaderProps = {
  /** Brand name to display */
  brandName?: string;
  /** Logo URL */
  logoUrl?: string;
  /** Website URL for the logo link */
  websiteUrl?: string;
};

/**
 * Email header component with logo and brand name
 */
export const EmailHeader = ({
  brandName = "Raypx",
  logoUrl,
  websiteUrl = "https://raypx.com",
}: EmailHeaderProps) => (
  <Container className="mb-6">
    {logoUrl ? (
      <Link href={websiteUrl}>
        <img alt={brandName} className="h-10 w-auto" src={logoUrl} />
      </Link>
    ) : (
      <Link className="font-bold text-gray-800 text-xl" href={websiteUrl}>
        {brandName}
      </Link>
    )}
  </Container>
);
