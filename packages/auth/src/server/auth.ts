import { db, schemas, uuidv7 } from "@raypx/db";
// import { getMailer } from "@raypx/email";
import { type BetterAuthOptions, type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  apiKey,
  emailOTP,
  lastLoginMethod,
  magicLink,
  mcp,
  oneTap,
  username,
} from "better-auth/plugins";
import { envs } from "../envs";
import { features } from "../features";

const getPlugins = () => {
  const plugins: BetterAuthPlugin[] = [];

  // Always include basic plugins
  plugins.push(
    username(),
    mcp({
      loginPage: "/signin",
    }),
    lastLoginMethod(),
  );

  // Add feature-specific plugins
  if (features.apiKey) {
    plugins.push(apiKey());
  }

  // Magic Link
  if (features.magicLink) {
    plugins.push(
      magicLink({
        sendMagicLink: async ({ email: _email, token: _token, url: _url }) => {
          // const mailer = await getMailer();
          // await mailer.sendEmail({
          //   subject: "Magic Link",
          //   from: "noreply@raypx.com",
          //   template: SendMagicLinkEmail({
          //     username: email,
          //     url,
          //     token,
          //   }),
          //   to: email,
          // });
        },
      }),
    );
  }

  // One Tap
  if (features.oneTap) {
    plugins.push(oneTap());
  }

  // Organization
  // if (features.organization) {
  //   plugins.push(
  //     admin({
  //       defaultRole: "user",
  //       adminRoles: ["admin", "superadmin"],
  //       ac,
  //       roles: {
  //         user: userRole,
  //         admin: adminRole,
  //         superadmin: superAdminRole,
  //       },
  //     }),
  //     organization(),
  //   );
  // }

  // Email OTP
  if (features.emailOTP) {
    plugins.push(
      emailOTP({
        sendVerificationOTP: async (_data, _request) => {
          // const { email, otp } = data;
          // const mailer = await getMailer();
          // await mailer.sendEmail({
          //   to: email,
          //   from: RESEND_FROM,
          //   subject: "Verify your email",
          //   template: SendVerificationOTPEmail({
          //     otp,
          //   }),
          // });
        },
      }),
    );
  }

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
    advanced: {
      database: {
        generateId: () => uuidv7(),
      },
      crossSubDomainCookies: {
        enabled: !!env.AUTH_DOMAIN,
        domain: env.AUTH_DOMAIN,
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
    },
    plugins,
  } satisfies BetterAuthOptions;
};

const config = createAuthOptions();

export const auth = betterAuth(config);

export type Auth = typeof auth;

export type Session = Awaited<ReturnType<Auth["api"]["getSession"]>>;
