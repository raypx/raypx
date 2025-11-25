import { useMemo } from "react";
import { getEmailTemplate } from "../lib/emails";

/**
 * Hook to get template preview text and generate smart default subject
 */
export function useTemplatePreview(templateName: string) {
  return useMemo(() => {
    const Template = getEmailTemplate(templateName);
    if (!Template) {
      return {
        previewText: null,
        defaultSubject: `[Test] ${templateName}`,
      };
    }

    // Try to get preview text from the template's preview props
    // We'll render the template with preview props and extract the preview text
    const previewProps = (Template as any).PreviewProps || {};

    // Generate a smart default subject based on template name and preview props
    let defaultSubject = `[Test] ${templateName}`;

    // Try to extract meaningful subject from template name
    // Convert PascalCase to readable text
    const readableName = templateName
      .replace(/([A-Z])/g, " $1")
      .trim()
      .replace(/Email$/, "")
      .trim();

    // Build subject based on template type and preview props
    if (templateName === "WelcomeEmail") {
      defaultSubject = previewProps.username
        ? `Welcome to Raypx, ${previewProps.username}!`
        : "Welcome to Raypx!";
    } else if (templateName === "VerifyEmail") {
      defaultSubject = "Verify Your Email Address";
    } else if (templateName === "ResetPasswordEmail") {
      defaultSubject = previewProps.username
        ? `Reset Your Password, ${previewProps.username}`
        : "Reset Your Password";
    } else if (templateName === "SecurityAlertEmail") {
      const alertType = previewProps.alertType || "security_alert";
      const alertTitles: Record<string, string> = {
        suspicious_login: "Suspicious Login Detected",
        password_changed: "Password Changed",
        email_changed: "Email Address Changed",
        two_factor_enabled: "Two-Factor Authentication Enabled",
        two_factor_disabled: "Two-Factor Authentication Disabled",
        api_key_created: "New API Key Created",
        api_key_deleted: "API Key Deleted",
      };
      defaultSubject = alertTitles[alertType] || "Security Alert";
    } else if (templateName === "OrganizationInviteEmail") {
      defaultSubject = previewProps.organizationName
        ? `Invitation to join ${previewProps.organizationName}`
        : "Organization Invitation";
    } else if (templateName === "SendMagicLinkEmail") {
      defaultSubject = previewProps.username
        ? `Magic Link for ${previewProps.username}`
        : "Your Magic Link";
    } else if (templateName === "SendVerificationOTPEmail") {
      defaultSubject = "Your Verification Code";
    } else if (templateName === "ApiKeyCreatedEmail") {
      defaultSubject = previewProps.keyName
        ? `API Key Created: ${previewProps.keyName}`
        : "API Key Created";
    } else {
      // Fallback: use readable name
      defaultSubject = readableName || `[Test] ${templateName}`;
    }

    return {
      previewText: null, // Could extract from rendered template if needed
      defaultSubject,
    };
  }, [templateName]);
}
