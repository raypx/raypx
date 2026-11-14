import type { drizzle } from "drizzle-orm/bun-sqlite";
export { ProfileStorage } from "./profile.js";
export type LocalDatabase = ReturnType<typeof drizzle>;
