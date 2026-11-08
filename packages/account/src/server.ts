import type { AccountProfile } from "@raypx/contracts/api";

export interface AccountServiceOptions {
  readSession: (headers: Headers) => Promise<{ user: AccountProfile } | null>;
}

/** The composition root supplies authentication; every read resolves a fresh session. */
export function createAccountService({ readSession }: AccountServiceOptions) {
  return {
    async get(headers: Headers): Promise<AccountProfile | null> {
      const session = await readSession(headers);
      if (!session) return null;
      const { id, email, name } = session.user;
      return { id, email, name };
    },
  };
}
