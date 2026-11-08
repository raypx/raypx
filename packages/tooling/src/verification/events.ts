/** Installer and installed-GUI acceptance is explicit, independent of source scope. */
export function distributionRequested(event: string, ref: string, requested?: unknown) {
  return (
    (event === "push" && ref.startsWith("refs/tags/")) ||
    (event === "workflow_dispatch" && (requested === true || requested === "true"))
  );
}
