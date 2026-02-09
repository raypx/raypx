import { Button, Section, Text } from "@react-email/components";
import { IconLink } from "@tabler/icons-react";
import { EmailLayout } from "../components/layout";

/**
 * Props for the magic link email component
 */
type SendMagicLinkEmailProps = {
  /** Username or display name */
  username: string;
  /** Base URL for the magic link */
  url: string;
  /** Authentication token */
  token: string;
  /** Whether to show the raw link */
  showRawLink?: boolean;
};

/**
 * Magic link authentication email template
 */
const SendMagicLinkEmail = ({
  username,
  url,
  token,
  showRawLink = true,
}: SendMagicLinkEmailProps) => {
  const link = `${url}?token=${token}`;
  return (
    <EmailLayout preview="Your magic link to sign in">
      {/* Hero Section */}
      <Section className="text-center">
        <div style={{ lineHeight: 0, color: "#111827" }}>
          <IconLink size={64} strokeWidth={1.5} />
        </div>
      </Section>
      <Text className="mt-4 text-center font-bold text-2xl text-gray-800">Magic Link Sign In</Text>
      <Text className="mt-4 text-center text-gray-600">Hi {username},</Text>
      <Text className="mt-2 text-center text-gray-600">
        Click the button below to sign in to your account
      </Text>

      <Section className="my-6 border-gray-200 border-b" />

      <Section className="my-6 text-center">
        <Button className="rounded-lg bg-primary px-8 py-3 font-medium text-white" href={link}>
          Sign In to Your Account
        </Button>
      </Section>

      {showRawLink && (
        <Section className="my-6 rounded-lg bg-gray-50 p-4">
          <Text className="mb-2 font-semibold text-gray-800 text-sm">
            Or copy and paste this link:
          </Text>
          <Text
            className="break-all font-mono text-primary text-sm"
            style={{ wordBreak: "break-all" }}
          >
            {link}
          </Text>
        </Section>
      )}

      <Section className="mt-6 text-center">
        <Text className="text-gray-500 text-sm">This link will expire in 15 minutes</Text>
        <Text className="mt-2 text-gray-500 text-sm">
          If you didn't request this link, you can safely ignore this email
        </Text>
      </Section>
    </EmailLayout>
  );
};

SendMagicLinkEmail.PreviewProps = {
  username: "John Doe",
  url: "https://raypx.com/auth/magic-link",
  token: "abc123def456ghi789",
};

export default SendMagicLinkEmail;
