import { cn } from "@raypx/ui/lib/utils";
import { Button, Section, Text } from "@react-email/components";
import { IconAlertCircle, IconInfoCircle, IconShield } from "@tabler/icons-react";
import { EmailLayout } from "../components/layout";

/**
 * Security alert types with different severity levels
 */
export type SecurityAlertType =
  | "suspicious_login"
  | "password_changed"
  | "email_changed"
  | "two_factor_enabled"
  | "two_factor_disabled"
  | "api_key_created"
  | "api_key_deleted";

/**
 * Props for the security alert email component
 */
export type SecurityAlertEmailProps = {
  /** Username or display name */
  username: string;
  /** Type of security alert */
  alertType: SecurityAlertType;
  /** Activity details */
  details: {
    timestamp: string;
    location?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: string;
  };
  /** Optional action URL */
  actionUrl?: string;
  /** Optional action button text */
  actionText?: string;
};

/**
 * Get alert configuration based on alert type
 */
const getAlertContent = (alertType: SecurityAlertType) => {
  const alertConfig = {
    suspicious_login: {
      title: "Suspicious Login Detected",
      message: "We detected a login to your account from an unrecognized device or location.",
      severity: "high" as const,
      icon: IconAlertCircle,
    },
    password_changed: {
      title: "Password Changed",
      message: "Your account password was successfully changed.",
      severity: "medium" as const,
      icon: IconInfoCircle,
    },
    email_changed: {
      title: "Email Address Changed",
      message: "Your account email address was successfully updated.",
      severity: "medium" as const,
      icon: IconInfoCircle,
    },
    two_factor_enabled: {
      title: "Two-Factor Authentication Enabled",
      message: "Two-factor authentication has been enabled on your account.",
      severity: "low" as const,
      icon: IconInfoCircle,
    },
    two_factor_disabled: {
      title: "Two-Factor Authentication Disabled",
      message: "Two-factor authentication has been disabled on your account.",
      severity: "high" as const,
      icon: IconAlertCircle,
    },
    api_key_created: {
      title: "New API Key Created",
      message: "A new API key was created for your account.",
      severity: "medium" as const,
      icon: IconInfoCircle,
    },
    api_key_deleted: {
      title: "API Key Deleted",
      message: "An API key was deleted from your account.",
      severity: "low" as const,
      icon: IconInfoCircle,
    },
  };

  return alertConfig[alertType];
};

/**
 * Get card styles based on severity
 */
const getCardStyles = (severity: "high" | "medium" | "low") => {
  const styles = {
    high: "border-red-200 bg-red-50",
    medium: "border-gray-200 bg-gray-50",
    low: "border-green-200 bg-green-50",
  };
  return styles[severity];
};

/**
 * Get button styles based on severity
 */
const getButtonStyles = (severity: "high" | "medium" | "low") => {
  const styles = {
    high: "bg-red-600 text-white",
    medium: "bg-primary text-white",
    low: "bg-primary text-white",
  };
  return styles[severity];
};

/**
 * Security alert notification email template
 */
const SecurityAlertEmail = ({
  username,
  alertType,
  details,
  actionUrl,
  actionText = "Review Security Settings",
}: SecurityAlertEmailProps) => {
  const alert = getAlertContent(alertType);
  const AlertIcon = alert.icon;
  const cardStyles = getCardStyles(alert.severity);
  const buttonStyles = getButtonStyles(alert.severity);
  const severityColor = {
    high: "#dc2626",
    medium: "#f59e0b",
    low: "#16a34a",
  }[alert.severity];

  return (
    <EmailLayout preview={`Security Alert: ${alert.title}`}>
      {/* Hero Section */}
      <Section className="text-center">
        <div style={{ lineHeight: 0, color: severityColor }}>
          <IconShield size={64} strokeWidth={1.5} />
        </div>
      </Section>
      <Text className="mt-4 text-center font-bold text-2xl text-gray-800">Security Alert</Text>

      <Section className="my-6 border-gray-200 border-b" />

      {/* Alert Details */}
      <Section className="my-6">
        <div className="mb-4 flex items-center">
          <div className="mr-2" style={{ color: severityColor }}>
            <AlertIcon size={24} strokeWidth={2} />
          </div>
          <Text className="font-semibold text-gray-800 text-xl">{alert.title}</Text>
        </div>
        <Text className="mt-4 text-gray-600">Hi {username},</Text>
        <Text className="mt-2 text-gray-600">{alert.message}</Text>
      </Section>

      {/* Activity Details Card */}
      <Section className={cn("my-4 rounded-lg border p-4", cardStyles)}>
        <Text className="mb-3 font-semibold text-gray-800">Activity Details:</Text>
        <Text className="my-1 text-gray-700 text-sm">
          <strong>Time:</strong> {details.timestamp}
        </Text>
        {details.location && (
          <Text className="my-1 text-gray-700 text-sm">
            <strong>Location:</strong> {details.location}
          </Text>
        )}
        {details.ipAddress && (
          <Text className="my-1 text-gray-700 text-sm">
            <strong>IP Address:</strong> {details.ipAddress}
          </Text>
        )}
        {details.userAgent && (
          <Text className="my-1 text-gray-700 text-sm">
            <strong>Device:</strong> {details.deviceInfo || details.userAgent}
          </Text>
        )}
      </Section>

      {alert.severity === "high" && (
        <Section className="my-4 rounded-lg border border-red-300 bg-red-50 p-4">
          <Text className="font-semibold text-red-900 text-sm">⚠️ Action Required:</Text>
          <Text className="mt-2 text-red-800 text-sm">
            If this wasn't you, please secure your account immediately
          </Text>
        </Section>
      )}

      {actionUrl && (
        <Section className="my-6 text-center">
          <Button className={cn("rounded-lg px-8 py-3 font-medium", buttonStyles)} href={actionUrl}>
            {actionText}
          </Button>
        </Section>
      )}

      <Section className="mt-6 text-center">
        <Text className="text-gray-500 text-sm">This is an automated security notification</Text>
        <Text className="mt-2 text-gray-500 text-sm">
          If you have concerns, contact our support team immediately
        </Text>
      </Section>
    </EmailLayout>
  );
};

SecurityAlertEmail.PreviewProps = {
  username: "John Doe",
  alertType: "suspicious_login",
  details: {
    timestamp: "January 15, 2024, 02:30 PM PST",
    location: "San Francisco, CA, US",
    ipAddress: "192.168.1.100",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    deviceInfo: "MacBook Pro (Chrome on macOS)",
  },
  actionUrl: "https://raypx.com/security",
  actionText: "Review Security Settings",
};

export default SecurityAlertEmail;
