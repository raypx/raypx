import { Container, Link, Row, Section, Text } from "@react-email/components";

/**
 * Props for the email footer component
 */
type EmailFooterProps = {
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
 * Email footer component with company info, social links, and unsubscribe option
 */
export const EmailFooter = ({
  brandName = "Raypx",
  address,
  supportEmail = "support@raypx.com",
  websiteUrl = "https://raypx.com",
  socialLinks,
  unsubscribeUrl,
  showUnsubscribe = true,
}: EmailFooterProps) => (
  <Container className="mt-8">
    <Section className="border-gray-200 border-t pt-6">
      <Text className="mb-4 text-gray-500 text-sm">
        &copy; {new Date().getFullYear()} {brandName}. All rights reserved.
      </Text>

      {address && <Text className="mb-2 text-gray-500 text-sm">{address}</Text>}

      {supportEmail && (
        <Text className="mb-4 text-gray-500 text-sm">
          Need help? Contact us at{" "}
          <Link className="text-blue-600" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </Link>
        </Text>
      )}

      {socialLinks && (socialLinks.twitter || socialLinks.github || socialLinks.linkedin) && (
        <Row className="mb-4">
          <Text className="mr-4 text-gray-500 text-sm">
            <Link className="text-gray-600" href={websiteUrl}>
              Website
            </Link>
          </Text>
          {socialLinks.twitter && (
            <Text className="mr-4 text-gray-500 text-sm">
              <Link className="text-gray-600" href={socialLinks.twitter}>
                Twitter
              </Link>
            </Text>
          )}
          {socialLinks.github && (
            <Text className="mr-4 text-gray-500 text-sm">
              <Link className="text-gray-600" href={socialLinks.github}>
                GitHub
              </Link>
            </Text>
          )}
          {socialLinks.linkedin && (
            <Text className="text-gray-500 text-sm">
              <Link className="text-gray-600" href={socialLinks.linkedin}>
                LinkedIn
              </Link>
            </Text>
          )}
        </Row>
      )}

      {showUnsubscribe && unsubscribeUrl && (
        <Text className="text-gray-400 text-xs">
          You received this email because you signed up for {brandName}.{" "}
          <Link className="text-gray-400 underline" href={unsubscribeUrl}>
            Unsubscribe
          </Link>
        </Text>
      )}
    </Section>
  </Container>
);
