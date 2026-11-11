import { releaseMetadataFile, resolveRelease, type ReleaseSurface } from "./release.js";

/** Hidden maps are an explicit release-build option, independent of user capture consent. */
export function analyticsBuild(surface: ReleaseSurface) {
  const release = resolveRelease(process.cwd(), process.env);
  return {
    define: {
      "import.meta.env.VITE_APP_RELEASE": JSON.stringify(release),
    },
    build: {
      sourcemap: process.env.RAYPX_SOURCEMAPS === "1" ? ("hidden" as const) : (false as const),
    },
    plugin: {
      name: "raypx-release-metadata",
      apply: "build" as const,
      generateBundle(this: {
        environment?: { name: string };
        emitFile: (asset: { type: "asset"; fileName: string; source: string }) => string;
      }) {
        if (this.environment?.name !== "client") return;
        this.emitFile({
          type: "asset",
          fileName: `assets/${releaseMetadataFile}`,
          source: JSON.stringify({ version: 1, surface, release }),
        });
      },
    },
  };
}
