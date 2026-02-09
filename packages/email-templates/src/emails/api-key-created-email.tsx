import { Button, Section, Text } from "@react-email/components";
import { IconAlertTriangle, IconKey, IconShield } from "@tabler/icons-react";
import { EmailLayout } from "../components/layout";

/**
 * Props for the API key created email component
 */
export type ApiKeyCreatedEmailProps = {
  /** Username or display name */
  username: string;
  /** Name of the API key */
  keyName: string;
  /** Prefix of the API key (e.g., "sk_live_") */
  keyPrefix: string;
  /** List of permissions granted to the key */
  permissions?: string[];
  /** Rate limit information */
  rateLimitInfo?: {
    maxRequests: number;
    timeWindow: string;
  };
  /** Creation timestamp */
  createdAt: string;
  /** URL to manage API keys in dashboard */
  dashboardUrl?: string;
  /** Whether to show security tips */
  securityTips?: boolean;
};

/**
 * API key creation notification email template
 */
const ApiKeyCreatedEmail = ({
  username,
  keyName,
  keyPrefix,
  permissions,
  rateLimitInfo,
  createdAt,
  dashboardUrl,
  securityTips = true,
}: ApiKeyCreatedEmailProps) => (
  <EmailLayout preview={`New API Key Created: ${keyName}`}>
    {/* Hero Section */}
    <Section className="text-center">
      <div style={{ lineHeight: 0, color: "#111827" }}>
        <IconKey size={64} strokeWidth={1.5} />
      </div>
    </Section>
    <Text className="mt-4 text-center font-bold text-2xl text-gray-800">New API Key Created</Text>
    <Text className="mt-4 text-center text-gray-600">Hi {username},</Text>
    <Text className="mt-2 text-center text-gray-600">
      A new API key has been successfully created for your account
    </Text>

    <Section className="my-6 border-gray-200 border-b" />

    {/* API Key Details */}
    <Section className="my-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <Text className="mb-3 flex items-center font-semibold text-primary">
        <IconShield className="mr-2" size={20} />
        API Key Details:
      </Text>
      <Text className="my-1 text-gray-700 text-sm">
        <strong>Name:</strong> {keyName}
      </Text>
      <Text className="my-1 text-gray-700 text-sm">
        <strong>Key Prefix:</strong> {keyPrefix}***
      </Text>
      <Text className="my-1 text-gray-700 text-sm">
        <strong>Created:</strong> {createdAt}
      </Text>
      {permissions && permissions.length > 0 && (
        <Text className="my-1 text-gray-700 text-sm">
          <strong>Permissions:</strong> {permissions.join(", ")}
        </Text>
      )}
      {rateLimitInfo && (
        <Text className="my-1 text-gray-700 text-sm">
          <strong>Rate Limit:</strong> {rateLimitInfo.maxRequests} requests per{" "}
          {rateLimitInfo.timeWindow}
        </Text>
      )}
    </Section>

    {securityTips && (
      <Section className="my-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <Text className="mb-3 flex items-center font-semibold text-yellow-900">
          <IconAlertTriangle className="mr-2" size={20} />
          Security Tips:
        </Text>
        <Text className="my-1 text-sm text-yellow-700">
          • Store your API key securely and never share it publicly
        </Text>
        <Text className="my-1 text-sm text-yellow-700">
          • Use environment variables to store keys in your applications
        </Text>
        <Text className="my-1 text-sm text-yellow-700">
          • Rotate your API keys regularly for better security
        </Text>
        <Text className="my-1 text-sm text-yellow-700">
          • Monitor your API usage and set up alerts for unusual activity
        </Text>
      </Section>
    )}

    {dashboardUrl && (
      <Section className="my-6 text-center">
        <Button
          className="rounded-lg bg-primary px-8 py-3 font-medium text-white"
          href={dashboardUrl}
        >
          Manage API Keys
        </Button>
      </Section>
    )}

    <Section className="mt-6 rounded-lg bg-gray-50 p-4">
      <Text className="text-gray-600 text-sm">
        If you didn't create this API key, please contact our support team immediately
      </Text>
    </Section>
  </EmailLayout>
);

ApiKeyCreatedEmail.PreviewProps = {
  username: "John Doe",
  keyName: "Production API Key",
  keyPrefix: "sk_live_1234567890",
  permissions: ["read", "write"],
  rateLimitInfo: {
    maxRequests: 1000,
    timeWindow: "1 hour",
  },
  createdAt: "January 15, 2024, 02:30 PM",
  dashboardUrl: "https://raypx.com/settings/api-keys",
  securityTips: true,
};

export default ApiKeyCreatedEmail;
