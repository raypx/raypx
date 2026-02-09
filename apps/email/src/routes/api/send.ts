import { sendEmail } from "@raypx/email";
import { createFileRoute } from "@tanstack/react-router";
import { createElement } from "react";
import env from "../../env";
import { getEmailTemplate } from "../../lib/emails";

type SendRequest = {
  templateName: string;
  to: string;
  subject?: string;
};

/**
 * API route for sending test emails
 * POST /api/send
 */
export const Route = createFileRoute("/api/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data: SendRequest = await request.json();

          // Validate input
          if (!data.templateName || !data.to) {
            return Response.json(
              { error: "Missing required fields: templateName, to" },
              { status: 400 },
            );
          }

          // Get template using the utility function
          const Template = getEmailTemplate(data.templateName);
          if (!Template || typeof Template !== "function") {
            return Response.json({ error: "Template not found" }, { status: 404 });
          }

          // Get preview props and create React element
          const props = (Template as any).PreviewProps || {};
          const templateElement = createElement(Template as any, props);

          // Check if we have email provider configured
          const hasResend = !!process.env.RESEND_API_KEY || !!process.env.AUTH_RESEND_KEY;
          const hasNodemailer = !!process.env.SMTP_HOST;

          // Mock mode - just log and return success
          if (!hasResend && !hasNodemailer) {
            return Response.json({
              success: true,
              message: "Email logged to console (mock mode)",
              emailId: `mock-${Date.now()}`,
            });
          }

          // Validate required environment variables for Resend
          if (hasResend && !env.RESEND_FROM) {
            return Response.json(
              {
                error: "RESEND_FROM environment variable is required but not set",
                provider: "resend",
              },
              { status: 500 },
            );
          }

          // Send email using new unified API
          const emailSubject = data.subject || `[Test] ${data.templateName}`;
          const result = await sendEmail({
            to: data.to,
            from: env.RESEND_FROM,
            subject: emailSubject,
            template: templateElement,
          });

          if (!result.success) {
            return Response.json(
              {
                error: result.error,
                provider: result.provider,
              },
              { status: 500 },
            );
          }

          return Response.json({
            success: true,
            message: `Email sent via ${result.provider}`,
            emailId: result.emailId || result.messageId || "unknown",
            provider: result.provider,
          });
        } catch (error) {
          console.error("Error sending test email:", error);
          return Response.json(
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
