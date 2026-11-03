export type SocialProvider = "google" | "github";

/** Public account fields only. These types never infer server/database internals. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  /** Better Auth Admin plugin roles, not a browser-assigned authorization claim. */
  role?: string;
  banned?: boolean;
  image?: string | null;
}
export interface AuthSession {
  user: AuthUser;
  session: { id: string; userId: string; expiresAt: Date; createdAt?: Date };
}
