/** A cancellation callback keeps timer handles portable across Bun and browsers. */
export interface RelayScheduler {
  now(): number;
  random(): number;
  timeout(callback: () => void, delay: number): () => void;
  interval(callback: () => void, delay: number): () => void;
}
export const systemRelayScheduler: RelayScheduler = {
  now: () => Date.now(),
  random: () => Math.random(),
  timeout(callback, delay) {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
  interval(callback, delay) {
    const timer = setInterval(callback, delay);
    return () => clearInterval(timer);
  },
};
