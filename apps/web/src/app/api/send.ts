import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn, json } from "@tanstack/react-start";

const sendEmail = createServerOnlyFn(async () => {
  const { getMailer } = await import("@raypx/email");
  const { SendVerificationOTPEmail } = await import("@raypx/email/emails");

  const mailer = await getMailer();
  const res = await mailer.sendEmail({
    to: "lorenx@163.com",
    from: "hello@raypx.com",
    subject: "Test",
    template: SendVerificationOTPEmail({
      username: "Test User",
      otp: "123456",
    }),
  });
  return res;
});

export const Route = createFileRoute("/api/send")({
  server: {
    handlers: {
      GET: async () => {
        const res = await sendEmail();
        return json({
          data: "OK",
          res,
        });
      },
    },
  },
});
