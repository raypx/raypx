import type { User, UserRepository } from "@voidmix/core";

import { requireDatabaseUrl } from "../database/policy.js";
import type { UserRepositoryConnection } from "../database/users.js";
import type { DatabaseScriptsEnvironment } from "../env.js";
import type { ScriptsLog } from "../runtime/logger.js";

export interface AdminCreateArguments {
  email?: string | undefined;
  name?: string | undefined;
}

interface AdminCreateEnvironment {
  ADMIN_DISPLAY_NAME?: string | undefined;
  ADMIN_EMAIL?: string | undefined;
  SEED_ADMIN_EMAIL: string;
  SEED_ADMIN_NAME: string;
}

interface AdministrationService {
  ensureAdmin(input: { displayName: string; email: string }): Promise<User>;
}

export interface CreateAdminDependencies {
  createAdministration(dependencies: { users: UserRepository }): AdministrationService;
  log: ScriptsLog;
  openUsers(databaseUrl: string): UserRepositoryConnection;
}

export function resolveAdminCreateInput(
  args: AdminCreateArguments,
  environment: AdminCreateEnvironment,
): { displayName: string; email: string } {
  return {
    email: args.email ?? environment.ADMIN_EMAIL ?? environment.SEED_ADMIN_EMAIL,
    displayName: args.name ?? environment.ADMIN_DISPLAY_NAME ?? environment.SEED_ADMIN_NAME,
  };
}

export async function runCreateAdmin(
  input: { displayName: string; email: string },
  environment: DatabaseScriptsEnvironment,
  dependencies: CreateAdminDependencies,
): Promise<void> {
  const connection = dependencies.openUsers(requireDatabaseUrl(environment));
  try {
    const administration = dependencies.createAdministration({ users: connection.users });
    const admin = await administration.ensureAdmin({
      email: input.email.toLowerCase(),
      displayName: input.displayName,
    });
    dependencies.log("info", "admin.create.completed", {
      adminId: admin.id,
      email: admin.email,
    });
  } finally {
    await connection.close();
  }
}
