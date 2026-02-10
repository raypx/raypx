import { db } from "@raypx/database";

export async function createContext({ req }: { req: Request }) {
  if (!req) {
    return {
      session: null,
      db,
    };
  }
  // TODO: Implement session management
  return { session: null, db };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
