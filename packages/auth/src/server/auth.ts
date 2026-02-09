import { db, eq, schemas } from "@raypx/database";
import { sendEmail } from "@raypx/email";
import {
  ResetPasswordEmail,
  SendMagicLinkEmail,
  SendVerificationOTPEmail,
  VerifyEmail,
} from "@raypx/email-templates";
import { type BetterAuthOptions, type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  admin,
  apiKey,
  emailOTP,
  lastLoginMethod,
  magicLink,
  mcp,
  oAuthProxy,
  username,
} from "better-auth/plugins";
import { envs } from "../envs";
import { features } from "../features";
import {
  ac,
  admin as adminRole,
  superadmin as superAdminRole,
  user as userRole,
} from "../permissions";
import { tanstackStartCookies } from "./integrations/cookies";

const getPlugins = () => {
  const plugins: BetterAuthPlugin[] = [];

  // Always include basic plugins
  plugins.push(
    username(),
    mcp({
      loginPage: "/sign-in",
    }),
  );

  // Add feature-specific plugins
  if (features.apiKey) {
    plugins.push(apiKey());
  }

  // Magic Link
  if (features.magicLink) {
    plugins.push(
      magicLink({
        sendMagicLink: async ({ email, token, url }) => {
          const env = envs();
          await sendEmail({
            to: email,
            from: env.RESEND_FROM,
            subject: "Your Magic Link - Raypx",
            template: SendMagicLinkEmail({
              username: email,
              url,
              token,
            }),
          });
        },
      }),
    );
  }

  // Organization
  // if (features.organization) {
  plugins.push(
    admin({
      defaultRole: "user",
      adminRoles: ["admin", "superadmin"],
      ac,
      roles: {
        user: userRole,
        admin: adminRole,
        superadmin: superAdminRole,
      },
    }),
    // organization(),
  );
  // }

  // Email OTP
  if (features.emailOTP) {
    plugins.push(
      emailOTP({
        sendVerificationOTP: async (data) => {
          const { email, otp } = data;
          const env = envs();
          // Try to get user name from database, fallback to email
          const user = await db.query.user.findFirst({
            where: eq(schemas.user.email, email),
            columns: { name: true },
          });
          await sendEmail({
            to: email,
            from: env.RESEND_FROM,
            subject: "Verify your email - Raypx",
            template: SendVerificationOTPEmail({
              username: user?.name || email,
              otp,
            }),
          });
        },
      }),
    );
  }

  plugins.push(lastLoginMethod());
  const env = envs();
  plugins.push(
    oAuthProxy({
      productionURL: env.VITE_AUTH_URL,
    }),
  );
  plugins.push(tanstackStartCookies());
  return plugins;
};

const createAuthOptions = () => {
  const env = envs();
  const plugins = getPlugins();
  return {
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schemas,
    }),
    experimental: {
      joins: true,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Set to true to require email verification
      sendResetPassword: async ({ user, url }) => {
        const env = envs();
        await sendEmail({
          to: user.email,
          from: env.RESEND_FROM,
          subject: "Reset your password - Raypx",
          template: ResetPasswordEmail({
            username: user.name || user.email,
            resetLink: url,
          }),
        });
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: true, // Automatically send verification email on sign up
      sendVerificationEmail: async ({ user, url }) => {
        const env = envs();
        await sendEmail({
          to: user.email,
          from: env.RESEND_FROM,
          subject: "Verify your email - Raypx",
          template: VerifyEmail({
            username: user.name || user.email,
            url,
          }),
        });
      },
    },
    baseURL: env.VITE_AUTH_URL,
    // trustedOrigins: (req) =>
    //   [req.headers.get("origin") ?? "", req.headers.get("referer") ?? ""].filter(
    //     Boolean,
    //   ) as string[],
    // session: {
    //   cookieCache: {
    //     enabled: true,
    //     maxAge: 5 * 60, // 5 minutes
    //   },
    //   expiresIn: 60 * 60 * 24 * 7, // 7 days
    //   updateAge: 60 * 60 * 24, // 1 day
    // },
    secret: env.AUTH_SECRET,
    // appName: "Raypx",
    advanced: {
      database: {
        generateId: "uuid",
      },
      disableOriginCheck: true,
      defaultCookieAttributes: {
        domain: process.env.NODE_ENV === "production" ? ".raypx.com" : undefined,
      },
      cookiePrefix: "auth",
    },
    user: {
      deleteUser: {
        enabled: true,
      },
    },
    socialProviders: {
      github: {
        clientId: env.AUTH_GITHUB_ID,
        clientSecret: env.AUTH_GITHUB_SECRET,
      },
      google: {
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
      },
    },
    logger: {
      disabled: false,
      level: "debug",
    },
    plugins,
  } satisfies BetterAuthOptions;
};

const config = createAuthOptions();

export const auth = betterAuth(config);

export type Auth = typeof auth;

export type Session = Awaited<ReturnType<Auth["api"]["getSession"]>>;
