let expired = false;
const listeners = new Set<() => void>();

export function expireSession() {
  expired = true;
  for (const listener of listeners) listener();
}
export function restoreSession() {
  expired = false;
  for (const listener of listeners) listener();
}
export const sessionExpired = () => expired;
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
