const mutationProcedureNames = new Set([
  "create",
  "sendTurn",
  "startRound",
  "continueRound",
  "setSpendingGrant",
  "acceptRevision",
  "createUpload",
  "completeUpload",
  "update",
  "complete",
  "archive",
  "restore",
  "retry",
]);

/** GET reads may be batched; named mutations always use POST. */
export function isMutationProcedure(path: readonly string[]): boolean {
  return mutationProcedureNames.has(path.at(-1) ?? "");
}
