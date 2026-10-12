const mutationProcedureNames = new Set([
  "create",
  "sendTurn",
  "startRound",
  "continueRound",
  "setSpendingGrant",
  "acceptRevision",
  "markRead",
  "createUpload",
  "completeUpload",
  "updateStatus",
  "update",
  "commitVersion",
  "complete",
  "resolveConflict",
  "transition",
  "acquireLease",
  "heartbeat",
  "archive",
  "restore",
  "resolve",
  "cancel",
  "retry",
  "register",
  "revoke",
  "bindProject",
  "claim",
  "acknowledge",
  "append",
  "attach",
  "upload",
]);

/** GET reads may be batched; named mutations always use POST. */
export function isMutationProcedure(path: readonly string[]): boolean {
  return mutationProcedureNames.has(path.at(-1) ?? "");
}
