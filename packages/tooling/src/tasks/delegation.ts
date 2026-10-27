interface Manifest {
  scripts?: Record<string, string>;
  raypx?: { taskScripts?: Record<string, string> };
}

/** Public package commands enter VP; its leaf selects the underlying runner once. */
export function taskScripts(manifest: Manifest): Record<string, string> {
  const values = manifest.raypx?.taskScripts ?? {};
  for (const [name, target] of Object.entries(values)) {
    if (!manifest.scripts?.[name] || typeof target !== "string" || !manifest.scripts[target])
      throw new Error(`Task delegation needs existing scripts: ${name}`);
    if (Object.hasOwn(values, target))
      throw new Error(`Task delegation must end in a runner script: ${name}`);
  }
  return values;
}
