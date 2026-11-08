/** Closes owned resources in reverse acquisition order, attempting every one. */
export function createLifecycle() {
  const closers: Array<() => Promise<unknown>> = [];
  return {
    own(close: () => Promise<unknown>) {
      closers.push(close);
    },
    /** Rejects with the first failure after every closer has run. */
    async close() {
      let failure: { error: unknown } | undefined;
      for (const close of closers.splice(0).reverse()) {
        try {
          await close();
        } catch (error) {
          failure ??= { error };
        }
      }
      if (failure) throw failure.error;
    },
  };
}
