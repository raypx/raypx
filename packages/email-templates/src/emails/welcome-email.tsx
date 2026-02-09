import { Section, Text } from "@react-email/components";
import {
  IconBooks,
  IconBulb,
  IconCheck,
  IconCircleCheck,
  IconCode,
  IconMessageCircle,
} from "@tabler/icons-react";
import { EmailLayout } from "../components/layout";

/**
 * Props for the welcome email component
 */
type WelcomeEmailProps = {
  /** Username or display name */
  username: string;
};

/**
 * Welcome email template for new users
 */
const WelcomeEmail = ({ username }: WelcomeEmailProps) => (
  <EmailLayout preview="Welcome to our platform!">
    {/* Hero Section */}
    <Section className="text-center">
      <div style={{ lineHeight: 0, color: "#111827" }}>
        <IconCircleCheck size={64} strokeWidth={1.5} />
      </div>
    </Section>
    <Text className="mt-4 text-center font-bold text-2xl text-gray-800">
      Welcome to Our Platform!
    </Text>
    <Text className="mt-4 text-center text-gray-600">Hi {username},</Text>
    <Text className="mt-2 text-center text-gray-600">
      Thank you for joining us. We're thrilled to have you on board!
    </Text>

    {/* Divider */}
    <Section className="my-6 border-gray-200 border-b" />

    {/* Getting Started Section */}
    <Section className="mb-4 flex items-center">
      <div className="mr-2" style={{ color: "#111827" }}>
        <IconCode size={24} strokeWidth={2} />
      </div>
      <Text className="font-semibold text-gray-800 text-lg">Get Started</Text>
    </Section>
    <Text className="mb-4 text-gray-600">
      Here are some resources to help you get up and running:
    </Text>

    <Section className="my-4 rounded-lg bg-gray-50 p-4">
      <Text className="mb-3 text-gray-700">
        <span className="mr-2 inline align-middle" style={{ color: "#22c55e" }}>
          <IconCheck size={16} strokeWidth={2} />
        </span>
        <span className="font-medium">Quick Start:</span>{" "}
        <a className="font-medium text-primary underline" href="https://raypx.com/docs/quick-start">
          Get started in minutes
        </a>
      </Text>
      <Text className="mb-3 text-gray-700">
        <span className="mr-2 inline align-middle" style={{ color: "#111827" }}>
          <IconBooks size={16} strokeWidth={2} />
        </span>
        <span className="font-medium">Documentation:</span>{" "}
        <a className="font-medium text-primary underline" href="https://raypx.com/docs">
          Explore detailed guides
        </a>
      </Text>
      <Text className="text-gray-700">
        <span className="mr-2 inline align-middle" style={{ color: "#eab308" }}>
          <IconBulb size={16} strokeWidth={2} />
        </span>
        <span className="font-medium">Tips & Tricks:</span>{" "}
        <span className="text-gray-600">Explore features at your own pace</span>
      </Text>
    </Section>

    {/* Support Section */}
    <Section className="my-6">
      <Section className="mb-2 flex items-center">
        <div className="mr-2" style={{ color: "#111827" }}>
          <IconMessageCircle size={24} strokeWidth={2} />
        </div>
        <Text className="font-semibold text-gray-800 text-lg">Need Help?</Text>
      </Section>
      <Text className="text-gray-600">
        If you have any questions, feel free to reach out to us at{" "}
        <a className="font-medium text-primary underline" href="mailto:support@raypx.com">
          support@raypx.com
        </a>
      </Text>
    </Section>

    {/* Closing */}
    <Section className="mt-8 text-center">
      <Text className="text-gray-600">We can't wait to see what you'll create!</Text>
      <Text className="mt-2 font-semibold text-gray-800">Happy exploring!</Text>
    </Section>
  </EmailLayout>
);

WelcomeEmail.PreviewProps = {
  username: "John Doe",
};

export default WelcomeEmail;
