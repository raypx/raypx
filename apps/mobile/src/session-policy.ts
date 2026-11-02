type Session = {
  user: { emailVerified: boolean };
  session: { expiresAt: Date | string };
};

/** Only a verified, freshly checked session can mount protected screens. */
export function sessionAccess(
  state: { isPending: boolean; isRefetching: boolean; error: unknown; data: Session | null },
  now = Date.now(),
): "pending" | "unavailable" | "signedOut" | "signedIn" {
  if (state.isPending || state.isRefetching) return "pending";
  if (
    state.error &&
    typeof state.error === "object" &&
    "status" in state.error &&
    state.error.status === 401
  )
    return "signedOut";
  if (state.error) return "unavailable";
  if (!state.data?.user.emailVerified || !(new Date(state.data.session.expiresAt).getTime() > now))
    return "signedOut";
  return "signedIn";
}
