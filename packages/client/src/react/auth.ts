import {
  useMutation as useQueryMutation,
  useQueryClient,
  isCancelledError,
  type QueryClient,
} from "@tanstack/react-query";
import { signIn, signOut, signUp } from "../auth.js";
import type { getSession } from "../session.js";
import { accountQueryPrefix, sessionQueryOptions, sessionQueryPrefix } from "./query.js";

type Session = Awaited<ReturnType<typeof getSession>>;
// Serialize cookie-changing writes across all three hooks within one QueryClient.
const authScope = { id: "raypx-account-transition" };

/**
 * Removes account data from both cache and mounted observer snapshots without
 * refetching the previous identity. Query#setState is public in Query 5.104;
 * keep this adapter covered when upgrading because removeQueries alone does
 * not clear observer results, while resetQueries would refetch active reads.
 */
async function replaceAccountSession(client: QueryClient, session: Session): Promise<void> {
  await client.cancelQueries({
    predicate: (query) =>
      query.queryKey[0] === accountQueryPrefix[0] || query.queryKey[0] === sessionQueryPrefix[0],
  });
  for (const query of client.getQueryCache().findAll({ queryKey: accountQueryPrefix })) {
    query.setState({
      data: undefined,
      dataUpdatedAt: 0,
      error: null,
      errorUpdatedAt: 0,
      status: "pending",
      fetchStatus: "idle",
    });
  }
  client.removeQueries({ queryKey: accountQueryPrefix });
  client.setQueriesData<Session>({ queryKey: sessionQueryPrefix }, session);
  client.setQueryData(sessionQueryOptions().queryKey, session);
}

/**
 * Signs in once, then removes all ['account', accountId, ...] private queries and
 * synchronizes every session scope from the confirmed public user response.
 * Returns TanStack's mutation result: mutateAsync rejects on write failure;
 * mutate exposes isPending/isError. Applications also invalidate Router-owned
 * authentication context after success. Private keys must use the current
 * session's account identity and be disabled after logout. Reset does not undo
 * a submitted write.
 */
export function useSignIn() {
  const client = useQueryClient();
  return useQueryMutation({
    mutationFn: (input: Parameters<typeof signIn>[0]) => signIn(input),
    onSuccess: ({ user }) => replaceAccountSession(client, { user }),
    retry: false,
    networkMode: "always",
    scope: authScope,
  });
}

/**
 * Creates an account without automatically retrying writes. A successful sign-up
 * does not always create a session (for example, verification may be required),
 * so session is re-read after clearing private data. If that read fails, account
 * creation remains successful and every existing session scope exposes the
 * retryable read error; retrying any scope synchronizes confirmed session data.
 * do not submit the account creation again just to refresh the session.
 */
export function useSignUp() {
  const client = useQueryClient();
  return useQueryMutation({
    mutationFn: (input: Parameters<typeof signUp>[0]) => signUp(input),
    onSuccess: async () => {
      await replaceAccountSession(client, { user: null });
      try {
        const session = await client.query({ ...sessionQueryOptions(), staleTime: 0 });
        client.setQueriesData<Session>({ queryKey: sessionQueryPrefix }, session);
      } catch (error) {
        if (isCancelledError(error)) return;
        const failure =
          error instanceof Error ? error : new Error("Unable to refresh session", { cause: error });
        // All projections share this failed post-write read. Keep safe anonymous
        // data while exposing a retryable error to every existing scope.
        for (const query of client.getQueryCache().findAll({ queryKey: sessionQueryPrefix })) {
          query.setState({
            data: { user: null },
            error: failure,
            errorUpdatedAt: Date.now(),
            status: "error",
            fetchStatus: "idle",
          });
        }
        await client.invalidateQueries({ queryKey: sessionQueryPrefix, refetchType: "none" });
      }
    },
    retry: false,
    networkMode: "always",
    scope: authScope,
  });
}

/** Successful sign-out aborts private reads, removes their cache and publishes user:null. */
export function useSignOut() {
  const client = useQueryClient();
  return useQueryMutation({
    mutationFn: () => signOut(),
    onSuccess: () => replaceAccountSession(client, { user: null }),
    retry: false,
    networkMode: "always",
    scope: authScope,
  });
}
