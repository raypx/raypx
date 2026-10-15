/** Public account fields only. These types never infer server/database internals. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
}
export interface AuthSession {
  user: AuthUser;
  session: { id: string; userId: string; expiresAt: Date };
}
