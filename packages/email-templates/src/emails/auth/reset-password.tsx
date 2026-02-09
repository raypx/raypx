import { Button, Section, Text } from "@react-email/components";
import { IconLock } from "@tabler/icons-react";
import { EmailLayout } from "../../components/layout";

/**
 * Props for the reset password email component
 */
type ResetPasswordEmailProps = {
  /** Username or display name */
  username: string;
  /** Password reset link */
  resetLink: string;
};

/**
 * Password reset email template
 */
const ResetPasswordEmail = ({ resetLink, username }: ResetPasswordEmailProps) => (
  <EmailLayout preview="Reset your password">
    {/* Hero Section */}
    <Section className="text-center">
      <div style={{ lineHeight: 0, color: "#111827" }}>
        <IconLock size={64} strokeWidth={1.5} />
      </div>
    </Section>
    <Text className="mt-4 text-center font-bold text-2xl text-gray-800">Reset Your Password</Text>
    <Text className="mt-4 text-center text-gray-600">Hi {username},</Text>
    <Text className="mt-2 text-center text-gray-600">
      We received a request to reset your password
    </Text>

    <Section className="my-6 border-gray-200 border-b" />

    <Section className="my-6 text-center">
      <Text className="mb-4 text-gray-600">Click the button below to create a new password:</Text>
      <Button className="rounded-lg bg-primary px-8 py-3 font-medium text-white" href={resetLink}>
        Reset Password
      </Button>
    </Section>

    <Section className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
      <Text className="mb-2 font-semibold text-sm text-yellow-900">⚠️ Important:</Text>
      <Text className="mb-2 text-sm text-yellow-800">• This link will expire in 1 hour</Text>
      <Text className="text-sm text-yellow-800">
        • If you didn't request this, you can safely ignore this email
      </Text>
    </Section>

    <Section className="mt-6 text-center">
      <Text className="text-gray-500 text-sm">
        For your security, this link can only be used once
      </Text>
    </Section>
  </EmailLayout>
);

ResetPasswordEmail.PreviewProps = {
  resetLink: "https://raypx.com/reset-password?token=abc123def456",
  username: "John Doe",
};

export default ResetPasswordEmail;
