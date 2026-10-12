import { connectDatabase, PostgresUserRepository } from "@voidmix/db";
import type { UserRepository } from "@voidmix/core";

export interface UserRepositoryConnection {
  close(): Promise<void>;
  users: UserRepository;
}

export function openPostgresUsers(databaseUrl: string): UserRepositoryConnection {
  const connection = connectDatabase(databaseUrl);
  return {
    users: new PostgresUserRepository(connection.db),
    close: () => connection.close(),
  };
}
