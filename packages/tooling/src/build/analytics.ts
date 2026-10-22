/** Hidden maps are an explicit release-build option, independent of user capture consent. */
export function analyticsBuild() {
  return {
    define: {
      "import.meta.env.VITE_APP_RELEASE": JSON.stringify(
        process.env.VITE_APP_RELEASE || "development",
      ),
    },
    build: {
      sourcemap: process.env.RAYPX_SOURCEMAPS === "1" ? ("hidden" as const) : (false as const),
    },
  };
}
