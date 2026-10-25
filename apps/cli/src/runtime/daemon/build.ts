import manifest from "../../../package.json";
declare const __RAYPX_CLI_BUILT_AT__: number;
export const cliBuild = {
  version: manifest.version,
  builtAt: typeof __RAYPX_CLI_BUILT_AT__ === "undefined" ? 0 : __RAYPX_CLI_BUILT_AT__,
};
