/**
 * Email Adapter Usage Examples
 *
 * This file demonstrates how to use the @raypx/email package
 * with different adapter providers.
 */

import type { EmailAdapter } from "@raypx/email";
import { getMailer, sendEmail } from "@raypx/email";
import { ADAPTERS } from "@raypx/email/adapters";

// ============================================
// Example 1: Basic Email Sending
// ============================================

async function basicEmail() {
  const result = await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Welcome!",
    template: "<div>Welcome to our service!</div>",
  });

  if (result.success) {
    console.log("Email sent successfully:", result.emailId);
  } else {
    console.error("Failed to send email:", result.error);
  }
}

// ============================================
// Example 2: Using React Templates
// ============================================

import { render } from "@react-email/render";

async function reactTemplateEmail() {
  const template = `
    <div>
      <h1>Welcome!</h1>
      <p>Thanks for signing up.</p>
    </div>
  `;

  const result = await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Welcome",
    template,
  });

  console.log("Result:", result);
}

// ============================================
// Example 3: Using Different Providers
// ============================================

async function sendWithResend() {
  const result = await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Sent via Resend",
    template: "<div>This email is sent via Resend</div>",
    provider: "resend",
  });
  console.log("Resend result:", result);
}

async function sendWithNodemailer() {
  const result = await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Sent via Nodemailer",
    template: "<div>This email is sent via Nodemailer (SMTP)</div>",
    provider: "nodemailer",
  });
  console.log("Nodemailer result:", result);
}

async function sendWithSendGrid() {
  const result = await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Sent via SendGrid",
    template: "<div>This email is sent via SendGrid</div>",
    provider: "sendgrid",
  });
  console.log("SendGrid result:", result);
}

async function sendWithAWSSES() {
  const result = await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Sent via AWS SES",
    template: "<div>This email is sent via AWS SES</div>",
    provider: "aws-ses",
  });
  console.log("AWS SES result:", result);
}

// ============================================
// Example 4: Getting Adapter Instance Directly
// ============================================

async function useAdapterDirectly() {
  // Get the default adapter (based on MAILER_PROVIDER env var)
  const mailer = await getMailer();

  const result = await mailer.sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Direct Adapter Usage",
    template: "<div>Using adapter directly</div>",
  });

  console.log("Direct adapter result:", result);
}

// ============================================
// Example 5: Using Specific Adapter Instance
// ============================================

async function useSpecificAdapter() {
  // Get a specific adapter instance
  const resendAdapter: EmailAdapter = await ADAPTERS.resend();

  const result = await resendAdapter.sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Specific Adapter",
    template: "<div>Using Resend adapter directly</div>",
  });

  console.log("Specific adapter result:", result);
}

// ============================================
// Example 6: Error Handling
// ============================================

async function errorHandlingExample() {
  try {
    const result = await sendEmail({
      to: "user@example.com",
      from: "noreply@example.com",
      subject: "Error Handling",
      template: "<div>This will show proper error handling</div>",
    });

    if (!result.success) {
      // Handle error
      console.error(`Failed to send email via ${result.provider}:`, result.error);

      // Log to monitoring service
      // logError(result.error);

      // Retry or fallback logic
      // await sendWithFallbackProvider(options);
    }
  } catch (error) {
    console.error("Unexpected error:", error);
  }
}

// ============================================
// Example 7: Multiple Recipients
// ============================================

async function multipleRecipients() {
  const recipients = ["user1@example.com", "user2@example.com"];

  // Send to multiple recipients (currently sends to first recipient)
  const result = await sendEmail({
    to: recipients,
    from: "noreply@example.com",
    subject: "Multiple Recipients",
    template: "<div>This is sent to multiple recipients</div>",
  });

  console.log("Multiple recipients result:", result);

  // Alternatively, loop through recipients
  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      sendEmail({
        to: recipient,
        from: "noreply@example.com",
        subject: "Individual Email",
        template: "<div>This is an individual email</div>",
      }),
    ),
  );

  console.log("Batch results:", results);
}

// ============================================
// Example 8: Provider Fallback Strategy
// ============================================

async function sendWithFallback(options: Parameters<typeof sendEmail>[0]) {
  const providers: Array<"resend" | "nodemailer" | "sendgrid"> = [
    "resend",
    "nodemailer",
    "sendgrid",
  ];

  for (const provider of providers) {
    try {
      const result = await sendEmail({
        ...options,
        provider,
      });

      if (result.success) {
        console.log(`Email sent successfully via ${provider}`);
        return result;
      }
    } catch (error) {
      console.warn(`Failed to send via ${provider}:`, error);
    }
  }

  throw new Error("All providers failed");
}

// ============================================
// Example 9: Environment Setup
// ============================================

/*
// .env file configuration:

# Choose your default provider
MAILER_PROVIDER=resend

# Nodemailer (SMTP) configuration
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your_email@example.com
MAIL_PASSWORD=your_password

# Resend configuration
AUTH_RESEND_KEY=re_xxxxxxxxxxxxxx

# SendGrid configuration
SENDGRID_API_KEY=SG.xxxxxx.xxxxxx

# AWS SES configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
*/

export {
  basicEmail,
  reactTemplateEmail,
  sendWithResend,
  sendWithNodemailer,
  sendWithSendGrid,
  sendWithAWSSES,
  useAdapterDirectly,
  useSpecificAdapter,
  errorHandlingExample,
  multipleRecipients,
  sendWithFallback,
};
