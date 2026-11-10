/** Release a caller on cancellation even when an adapter cannot cancel its operation. */
export function abortable<T>(signal: AbortSignal, run: () => T | PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    if (signal.aborted) {
      aborted();
      return;
    }
    signal.addEventListener("abort", aborted, { once: true });
    let operation: T | PromiseLike<T>;
    try {
      operation = run();
    } catch (error) {
      signal.removeEventListener("abort", aborted);
      reject(error);
      return;
    }
    Promise.resolve(operation).then(
      (result) => {
        signal.removeEventListener("abort", aborted);
        if (signal.aborted) reject(signal.reason);
        else resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
  });
}
