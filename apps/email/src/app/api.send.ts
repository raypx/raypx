import { sendEmail } from "@raypx/email";
import * as emails from "@raypx/email/emails";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { createElement } from "react";

type SendTestEmailRequest = {
  templateName: string;
  to: string;
};

/**
 * API route for sending test emails
 * POST /api/send-test-email
 */
export const Route = createFileRoute("/api/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data: SendTestEmailRequest = await request.json();

          // Validate input
          if (!data.templateName || !data.to) {
            return json({ error: "Missing required fields: templateName, to" }, { status: 400 });
          }

          // Get template
          const Template = emails[data.templateName as keyof typeof emails];
          if (!Template || typeof Template !== "function") {
            return json({ error: "Template not found" }, { status: 404 });
          }

          // Get preview props and create React element
          const props = (Template as any).PreviewProps || {};
          // Use createElement with any cast to bypass strict type checking
          const templateElement = createElement(Template as any, props);

          // Check if we have email provider configured
          const hasResend = !!process.env.RESEND_API_KEY || !!process.env.AUTH_RESEND_KEY;
          const hasNodemailer = !!process.env.SMTP_HOST;

          // Mock mode - just log and return success
          if (!hasResend && !hasNodemailer) {
            console.log("\n📧 Mock Email Send:");
            console.log("  To:", data.to);
            console.log("  From: preview@raypx.dev");
            console.log("  Subject:", `[Test] ${data.templateName}`);
            console.log("  Template:", data.templateName);
            console.log("ℹ️  Configure RESEND_API_KEY or SMTP credentials to send real emails\n");

            return json({
              success: true,
              message: "Email logged to console (mock mode)",
              emailId: `mock-${Date.now()}`,
            });
          }

          // Send email using new unified API
          const result = await sendEmail({
            to: data.to,
            from: "preview@raypx.dev",
            subject: `[Test] ${data.templateName}`,
            template: templateElement,
          });

          if (!result.success) {
            return json(
              {
                error: result.error,
                provider: result.provider,
              },
              { status: 500 },
            );
          }

          return json({
            success: true,
            message: `Email sent via ${result.provider}`,
            emailId: result.emailId || result.messageId || "unknown",
            provider: result.provider,
          });
        } catch (error) {
          console.error("Error sending test email:", error);
          return json(
            {
              error: error instanceof Error ? error.message : "Internal server error",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
