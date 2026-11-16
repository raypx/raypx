import { connectDatabase } from "@raypx/database/connection";
import { accountBootstrap, spaces, spaceMembers, user } from "@raypx/database/schema";
import { and, eq } from "drizzle-orm";

export async function productionAcceptanceState(databaseURL: string) {
  const url = new URL(databaseURL);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/_test(?:_[a-z0-9]+)?$/.test(url.pathname)
  )
    throw new Error(
      "Production acceptance requires an explicitly selected disposable loopback database",
    );
  const connection = connectDatabase(databaseURL);
  try {
    return {
      hadBootstrap: (await connection.db.select().from(accountBootstrap).limit(1)).length > 0,
    };
  } finally {
    await connection.close();
  }
}

export async function cleanProductionAcceptance(
  databaseURL: string,
  email: string,
  state: { hadBootstrap: boolean },
) {
  await productionAcceptanceState(databaseURL);
  if (!/^restart-[a-f0-9-]+@example\.invalid$/.test(email))
    throw new Error("Invalid owned acceptance account");
  const connection = connectDatabase(databaseURL);
  try {
    await connection.db.transaction(async (tx) => {
      const [account] = await tx.select().from(user).where(eq(user.email, email));
      if (account) {
        const owned = await tx
          .select()
          .from(spaceMembers)
          .where(and(eq(spaceMembers.accountId, account.id), eq(spaceMembers.role, "owner")));
        for (const member of owned) await tx.delete(spaces).where(eq(spaces.id, member.spaceId));
        await tx.delete(user).where(eq(user.id, account.id));
      }
      if (!state.hadBootstrap && !(await tx.select().from(user).limit(1)).length)
        await tx.delete(accountBootstrap);
    });
  } finally {
    await connection.close();
  }
}
