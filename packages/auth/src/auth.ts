import { db, nanoid, schemas, uuidv7 } from "@raypx/db"
import { resend, sendEmail } from "@raypx/email"
import ResetPasswordEmail from "@raypx/email/templates/reset-password-email"
import SendMagicLinkEmail from "@raypx/email/templates/send-magic-link-email"
import VerifyEmail from "@raypx/email/templates/verify-email"
import WelcomeEmail from "@raypx/email/templates/welcome-email"
import { type BetterAuthOptions, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import {
  admin,
  apiKey,
  emailOTP,
  magicLink,
  mcp,
  multiSession,
  oneTap,
  organization,
} from "better-auth/plugins"
import { envs } from "./envs"
import {
  ac,
  admin as adminRole,
  superadmin as superAdminRole,
  user as userRole,
} from "./permissions"

// import { redisStorage } from "./storage"

const createConfig = (): BetterAuthOptions => {
  const env = envs()

  return {
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Reset your password",
          template: ResetPasswordEmail({
            resetLink: url,
            username: user.name || user.email,
          }),
        })
      },
    },

    emailVerification: {
      sendVerificationEmail: async ({ url, user }) => {
        await sendEmail({
          subject: "Verify your email",
          template: VerifyEmail({
            url,
            username: user.email,
          }),
          to: user.email,
        })
      },
    },
    // secondaryStorage: redisStorage({
    //   url: env.REDIS_URL,
    // }),
    baseURL: env.NEXT_PUBLIC_AUTH_URL,
    socialProviders: {
      github: {
        enabled: !!(
          env.AUTH_GITHUB_ID &&
          env.AUTH_GITHUB_SECRET &&
          env.NEXT_PUBLIC_AUTH_GITHUB_ENABLED === "true"
        ),
        clientId: env.AUTH_GITHUB_ID ?? "",
        clientSecret: env.AUTH_GITHUB_SECRET ?? "",
      },
      google: {
        enabled: !!(
          env.AUTH_GOOGLE_ID &&
          env.AUTH_GOOGLE_SECRET &&
          env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true"
        ),
        clientId: env.AUTH_GOOGLE_ID ?? "",
        clientSecret: env.AUTH_GOOGLE_SECRET ?? "",
      },
    },

    trustedOrigins: (req) =>
      [
        req.headers.get("origin") ?? "",
        req.headers.get("referer") ?? "",
      ].filter(Boolean) as string[],
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
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
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const name =
              user.name?.trim() || user.email?.split("@")[0] || nanoid()
            const image =
              user.image || `https://ui-avatars.com/api/?name=${name}`

            return {
              data: {
                name,
                image,
              },
            }
          },
          after: async (user) => {
            await sendEmail({
              subject: "Welcome to Raypx",
              template: WelcomeEmail({
                username: user.name || user.email,
              }),
              to: user.email,
            })
          },
        },
      },
    },
    logger: {
      disabled: false,
      level: "debug",
    },
    plugins: [
      apiKey(),
      magicLink({
        sendMagicLink: async ({ email, token, url }) => {
          await sendEmail({
            subject: "Magic Link",
            template: SendMagicLinkEmail({
              username: email,
              url,
              token,
            }),
            to: email,
          })
        },
      }),
      oneTap(),
      multiSession(),
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
      organization(),
      mcp({
        loginPage: "/signin",
      }),
      emailOTP({
        sendVerificationOTP: async (data, _request) => {
          const { email, otp } = data
          await resend.emails.send({
            from: env.RESEND_FROM || "noreply@example.com",
            to: email,
            subject: "Verify your email",
            html: `Verify your email with the code: ${otp}`,
          })
        },
      }),
    ],
  }
}

const config: BetterAuthOptions = createConfig()
export const auth = betterAuth(config)
