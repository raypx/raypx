export interface EmailTemplateContext {
  appName?: string;
  year?: number;
}

function getDefaultContext(context: EmailTemplateContext = {}): Required<EmailTemplateContext> {
  return {
    appName: context.appName || "Raypx",
    year: context.year || new Date().getFullYear(),
  };
}

export function createPasswordResetTemplate(url: string, context?: EmailTemplateContext) {
  const { appName, year } = getDefaultContext(context);

  return {
    subject: `Reset Your Password - ${appName}`,
    html: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: #fff; margin: 0; font-size: 24px;">Reset Your Password</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
          <p style="margin-top: 0;">We received a request to reset your password. Click the button below to create a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600;">Reset Password</a>
          </div>
          <p style="margin-bottom: 0;"><strong>Important:</strong> This link will expire in 15 minutes for your security.</p>
          <p style="margin-bottom: 0;">If you didn't request this password reset, please ignore this email.</p>
        </div>
        <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
          <p style="margin: 0;">© ${year} ${appName}. All rights reserved.</p>
        </div>
      </body>
    </html>
  `,
  };
}

export function createEmailVerificationTemplate(url: string, context?: EmailTemplateContext) {
  const { appName, year } = getDefaultContext(context);

  return {
    subject: `Verify Your Email - ${appName}`,
    html: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: #fff; margin: 0; font-size: 24px;">Verify Your Email</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
          <p style="margin-top: 0;">Thank you for signing up! Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600;">Verify Email</a>
          </div>
          <p style="margin-bottom: 0;">If you didn't create an account, please ignore this email.</p>
        </div>
        <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
          <p style="margin: 0;">© ${year} ${appName}. All rights reserved.</p>
        </div>
      </body>
    </html>
  `,
  };
}

export function createWelcomeEmailTemplate(email: string, context?: EmailTemplateContext) {
  const { appName, year } = getDefaultContext(context);

  return {
    subject: `Welcome to ${appName}!`,
    html: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: #fff; margin: 0; font-size: 24px;">Welcome to ${appName}!</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
          <p style="margin-top: 0; font-size: 16px;">Hi ${email},</p>
          <p>We're excited to have you on board! Your account has been successfully created.</p>
          <p>You can now start exploring all the features and capabilities of ${appName}.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${context?.appName === "Raypx" ? "http://localhost:3000" : "#"}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600;">Get Started</a>
          </div>
          <p style="margin-bottom: 0;">If you have any questions, feel free to reach out to our support team.</p>
        </div>
        <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
          <p style="margin: 0;">© ${year} ${appName}. All rights reserved.</p>
        </div>
      </body>
    </html>
  `,
  };
}
