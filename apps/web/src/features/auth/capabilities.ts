import { createWebApiClient, type ApiClient } from "../../lib/api-client";
import { useEffect, useState } from "react";

export type PublicAuthCapabilities = Awaited<ReturnType<ApiClient["auth"]["capabilities"]["get"]>>;

const failOpenCapabilities: PublicAuthCapabilities = {
  registrationAvailable: true,
  verificationEmailRequestAvailable: true,
  passwordResetRequestAvailable: true,
};

const api = createWebApiClient();
const loadCapabilities = () => api.auth.capabilities.get({});

export function useAuthCapabilities(
  load: () => Promise<PublicAuthCapabilities> = loadCapabilities,
): PublicAuthCapabilities {
  const [capabilities, setCapabilities] = useState(failOpenCapabilities);

  useEffect(() => {
    let active = true;
    void load()
      .then((next) => {
        if (active) setCapabilities(next);
      })
      .catch(() => {
        // Public auth navigation deliberately fails open. The server remains authoritative.
      });
    return () => {
      active = false;
    };
  }, [load]);

  return capabilities;
}
