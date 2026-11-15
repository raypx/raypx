import type { CSSProperties } from "react";
import { agentIdentityIndex } from "../model.js";

export function agentIdentityStyle(id: string, avatar = false): CSSProperties {
  const slot = agentIdentityIndex(id);
  return {
    color: `var(--identity-${slot})`,
    ...(avatar ? { backgroundColor: `var(--identity-${slot}-bg)` } : {}),
  };
}
