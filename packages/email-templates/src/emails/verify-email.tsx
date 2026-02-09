import { Button, Section, Text } from "@react-email/components";
import { IconMail } from "@tabler/icons-react";
import { EmailLayout } from "../components/layout";

/**
 * Props for the verify email component
 */
type VerifyEmailProps = {
  /** Username or display name */
  username: string;
  /** Verification URL */
  url: string;
};

/**
 * Email verification template
 */
const VerifyEmail = ({ url, username }: VerifyEmailProps) => (
  <EmailLayout preview="Verify your email address">
    {/* Hero Section */}
    <Section className="text-center">
      <div style={{ lineHeight: 0, color: "#111827" }}>
        <IconMail size={64} strokeWidth={1.5} />
      </div>
    </Section>
    <Text className="mt-4 text-center font-bold text-2xl text-gray-800">Verify Your Email</Text>
    <Text className="mt-4 text-center text-gray-600">Hi {username},</Text>
    <Text className="mt-2 text-center text-gray-600">
      Please verify your email address to complete your registration
    </Text>

    <Section className="my-6 border-gray-200 border-b" />

    <Section className="my-6 text-center">
      <Text className="mb-4 text-gray-600">
        Click the button below to verify your email address:
      </Text>
      <Button className="rounded-lg bg-primary px-8 py-3 font-medium text-white" href={url}>
        Verify Email Address
      </Button>
    </Section>

    <Section className="mt-8 text-center">
      <Text className="text-gray-500 text-sm">This link will expire in 24 hours</Text>
      <Text className="mt-2 text-gray-500 text-sm">
        If you didn't create an account, you can safely ignore this email
      </Text>
    </Section>
  </EmailLayout>
);

VerifyEmail.PreviewProps = {
  url: "https://raypx.com/verify-email?token=abc123def456",
  username: "John Doe",
};

export default VerifyEmail;
