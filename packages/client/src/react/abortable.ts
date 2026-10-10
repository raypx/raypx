/** Settles cancellation even when an underlying operation ignores its signal. */
export function abortable<T>(operation: () => T | Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    let result: T | Promise<T>;
    try {
      result = operation();
    } catch (error) {
      signal.removeEventListener("abort", abort);
      reject(error);
      return;
    }
    void Promise.resolve(result).then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
