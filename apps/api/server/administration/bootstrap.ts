import { projectAuthUser, type Auth } from "@raypx/auth/server";
import { assignedRoles } from "@raypx/auth/access";

/** Explicit operator action; never run on startup or as an authorization fallback. */
export async function bootstrapAdministrators(
  auth: Pick<Auth, "$context">,
  emails: readonly string[],
) {
  if (!emails.length) throw new Error("ADMIN_EMAILS_REQUIRED");
  const adapter = (await auth.$context).internalAdapter;
  const accounts = await Promise.all(
    [...new Set(emails)].map((email) => adapter.findUserByEmail(email)),
  );
  const users = accounts.map((account) => projectAuthUser(account?.user));
  // Validate the entire selection before updating any account.
  if (users.some((user) => !user?.emailVerified || user.banned))
    throw new Error("VERIFIED_ACCOUNTS_REQUIRED");
  let updated = 0;
  for (const user of users) {
    if (!user || assignedRoles(user.role).includes("admin")) continue;
    await adapter.updateUser(user.id, { role: "admin" });
    updated++;
  }
  return { updated };
}

if (import.meta.main) {
  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
    const { getApiEnvironment } = await import("../env.js");
    const { createApiRuntime } = await import("../runtime/server.js");
    const environment = getApiEnvironment();
    if (!environment.ADMIN_EMAILS.length) throw new Error("ADMIN_EMAILS_REQUIRED");
    const runtime = await createApiRuntime(environment);
    try {
      const { updated } = await bootstrapAdministrators(runtime.auth, environment.ADMIN_EMAILS);
      console.log(`Initialized ${updated} administrator accounts.`);
    } finally {
      await runtime.close();
    }
  } catch {
    // Driver errors and connection credentials never enter command output.
    console.error(
      "Administrator initialization failed. Check database migrations and verified accounts in ADMIN_EMAILS.",
    );
    process.exitCode = 1;
  }
}
