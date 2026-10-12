import { createFileContentCache } from "../features/files/content-cache";

export function createAccountResources() {
  const disposers = new Map<string, Set<() => void>>();
  const createdRuns = new Map<string, Set<string>>();
  const files = createFileContentCache();
  return {
    files,
    register(accountId: string, dispose: () => void) {
      const owned = disposers.get(accountId) ?? new Set<() => void>();
      disposers.set(accountId, owned);
      owned.add(dispose);
      return () => {
        owned.delete(dispose);
        if (!owned.size) disposers.delete(accountId);
      };
    },
    markCreated(accountId: string, runId: string) {
      const runs = createdRuns.get(accountId) ?? new Set<string>();
      createdRuns.set(accountId, runs);
      runs.add(runId);
    },
    wasCreated: (accountId: string, runId: string) =>
      createdRuns.get(accountId)?.has(runId) ?? false,
    forgetCreated(accountId: string, runId: string) {
      createdRuns.get(accountId)?.delete(runId);
    },
    disposeAccount(accountId: string) {
      for (const dispose of disposers.get(accountId) ?? []) dispose();
      disposers.delete(accountId);
      createdRuns.delete(accountId);
      files.disposeAccount(accountId);
    },
  };
}
