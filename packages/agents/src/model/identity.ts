/** Stable, platform-independent identity slot. No schema or persisted color. */
export function agentIdentityIndex(id: string): number {
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 8) + 1;
}
