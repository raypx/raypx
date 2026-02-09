import { Section, Text } from "@react-email/components";
import { IconKey } from "@tabler/icons-react";
import { EmailLayout } from "../components/layout";

/**
 * Props for the send verification OTP component
 */
type SendVerificationOTPProps = {
  /** Username or display name */
  username: string;
  /** One-time password code */
  otp: string;
  /** OTP expiration time (e.g., "10 minutes") */
  expirationTime?: string;
};

/**
 * OTP verification email template
 */
const SendVerificationOTPEmail = ({
  username,
  otp,
  expirationTime = "10 minutes",
}: SendVerificationOTPProps) => (
  <EmailLayout preview="Your verification code">
    {/* Hero Section */}
    <Section className="text-center">
      <div style={{ lineHeight: 0, color: "#111827" }}>
        <IconKey size={64} strokeWidth={1.5} />
      </div>
    </Section>
    <Text className="mt-4 text-center font-bold text-2xl text-gray-800">
      Your Verification Code
    </Text>
    <Text className="mt-4 text-center text-gray-600">Hi {username},</Text>
    <Text className="mt-2 text-center text-gray-600">
      Enter the following code to verify your email address:
    </Text>

    <Section className="my-6 border-gray-200 border-b" />

    {/* OTP Code */}
    <Section className="my-8 text-center">
      <Text
        className="inline-block rounded-lg bg-gray-50 px-10 py-6 font-bold font-mono text-4xl text-gray-800"
        style={{
          letterSpacing: "0.5em",
          border: "2px solid #e5e7eb",
        }}
      >
        {otp}
      </Text>
    </Section>

    {/* Security Tips */}
    <Section className="my-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <Text className="mb-3 font-semibold text-primary">🔒 Security Tips:</Text>
      <Text className="mb-2 text-gray-700 text-sm">
        • This code will expire in {expirationTime}
      </Text>
      <Text className="mb-2 text-gray-700 text-sm">• Never share this code with anyone</Text>
      <Text className="text-gray-700 text-sm">
        • Our team will never ask for your verification code
      </Text>
    </Section>

    <Section className="mt-6 text-center">
      <Text className="text-gray-500 text-sm">
        If you didn't request this code, you can safely ignore this email
      </Text>
    </Section>
  </EmailLayout>
);

SendVerificationOTPEmail.PreviewProps = {
  username: "John Doe",
  otp: "123456",
};

export default SendVerificationOTPEmail;
