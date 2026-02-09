import { auth } from "@raypx/auth/server";
import { db } from "@raypx/database";

export async function createContext({ req }: { req: Request }) {
  if (!req) {
    return {
      session: null,
      db,
    };
  }
  const session = await auth.api.getSession({ headers: req.headers });
  return { session, db };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
