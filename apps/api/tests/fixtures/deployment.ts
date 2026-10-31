import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth } from "@raypx/auth/server";
import { connectDatabase } from "@raypx/database/connection";
import { schema } from "@raypx/database/schema";

const {
  TEST_DATABASE_URL,
  RAYPX_DEPLOYMENT_FIXTURE,
  FIXTURE_ORIGIN,
  FIXTURE_EMAIL,
  FIXTURE_PASSWORD,
} = process.env;
if (
  RAYPX_DEPLOYMENT_FIXTURE !== "1" ||
  !TEST_DATABASE_URL ||
  !/^\/raypx_deployment_[\w]+_test$/.test(new URL(TEST_DATABASE_URL).pathname) ||
  !FIXTURE_ORIGIN ||
  !FIXTURE_EMAIL?.endsWith("@example.invalid") ||
  !FIXTURE_PASSWORD
)
  throw new Error(
    "Deployment fixtures require an owned deployment test database and synthetic account",
  );

const connection = connectDatabase(TEST_DATABASE_URL);
try {
  let verification: string | undefined;
  const auth = createAuth({
    database: drizzleAdapter(connection.db, { provider: "pg", schema }),
    config: {
      baseURL: FIXTURE_ORIGIN,
      secret: "synthetic-deployment-fixture-secret-32-characters",
      trustedOrigins: [FIXTURE_ORIGIN],
      production: true,
    },
    mailer: {
      async sendVerification({ url }) {
        verification = url;
      },
      async sendPasswordReset() {},
    },
  });
  const signup = await auth.handler(
    new Request(`${FIXTURE_ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: FIXTURE_ORIGIN },
      body: JSON.stringify({
        name: "Deployment fixture",
        email: FIXTURE_EMAIL,
        password: FIXTURE_PASSWORD,
      }),
    }),
  );
  if (!signup.ok || !verification) throw new Error("Unable to create deployment fixture");
  const verified = await auth.handler(new Request(verification));
  if (![200, 302].includes(verified.status)) throw new Error("Unable to verify deployment fixture");
  console.log("Synthetic deployment account created and verified");
} finally {
  await connection.close();
}
