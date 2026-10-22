import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnalyticsProvider } from "@raypx-kit/analytics/react";
import { type AnalyticsClient, type AnalyticsConsent } from "@raypx-kit/analytics";
import { parseAnalyticsConsent, type AnalyticsPreferenceStore } from "../index.js";
const empty = parseAnalyticsConsent(null);
const context = createContext({
  consent: empty,
  ready: false,
  pending: false,
  error: false,
  configured: false,
  change: (_value: AnalyticsConsent) => {},
  retry: () => {},
});
export function useAnalyticsPreferences() {
  return useContext(context);
}
export function AnalyticsPreferencesProvider({
  client,
  store,
  configured,
  children,
}: {
  client: AnalyticsClient;
  store: AnalyticsPreferenceStore;
  configured: boolean;
  children: ReactNode;
}) {
  const [consent, setConsent] = useState(empty),
    [ready, setReady] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(false);
  const generation = useRef(0),
    busy = useRef(false);
  const desired = useRef<AnalyticsConsent | null>(null);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    let active = true;
    const restore = () => {
      const version = ++generation.current;
      void Promise.resolve()
        .then(() => store.read())
        .catch(() => empty)
        .then((value) => {
          if (active && version === generation.current) {
            const next = parseAnalyticsConsent(value);
            client.setConsent(next);
            setConsent(next);
            busy.current = false;
            setPending(false);
            setReady(true);
          }
        });
    };
    restore();
    const unsubscribe = store.subscribe?.(restore);
    return () => {
      active = false;
      invalidate();
      unsubscribe?.();
      client.setConsent(empty);
      client.reset();
    };
  }, [client, store, invalidate]);
  function change(value: AnalyticsConsent) {
    if (busy.current || !ready) return;
    desired.current = value;
    busy.current = true;
    const version = ++generation.current;
    setPending(true);
    setError(false);
    // Revocation takes effect even if saving fails; enabling waits for durable preference storage.
    const interim = { usage: consent.usage && value.usage, errors: consent.errors && value.errors };
    client.setConsent(interim);
    setConsent(interim);
    void store
      .write(value)
      .catch(() => false)
      .then((ok) => {
        if (version !== generation.current) return;
        const next = ok ? value : interim;
        client.setConsent(next);
        setConsent(next);
        setError(!ok);
        if (ok) desired.current = null;
      })
      .finally(() => {
        busy.current = false;
        if (version === generation.current) setPending(false);
      });
  }
  return (
    <AnalyticsProvider client={client}>
      <context.Provider
        value={{
          consent,
          ready,
          pending,
          error,
          configured,
          change,
          retry: () => {
            if (desired.current) change(desired.current);
          },
        }}
      >
        {children}
      </context.Provider>
    </AnalyticsProvider>
  );
}
export function AnalyticsIdentity({
  client,
  accountId,
}: {
  client: AnalyticsClient;
  accountId: string | null;
}) {
  useEffect(() => {
    client.identify(accountId);
    return () => client.reset();
  }, [client, accountId]);
  return null;
}
export { useAnalytics, AnalyticsErrorBoundary } from "@raypx-kit/analytics/react";
