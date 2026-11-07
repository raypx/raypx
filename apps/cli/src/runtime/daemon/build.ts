import manifest from "../../../package.json";
declare const __RAYPX_CLI_BUILT_AT__: number;
declare const __RAYPX_CLI_EXTERNAL_BUN__: boolean;
// Only the isolated packaging experiment defines this flag. Production embeds Bun.
export const cliExternalBun =
  typeof __RAYPX_CLI_EXTERNAL_BUN__ !== "undefined" && __RAYPX_CLI_EXTERNAL_BUN__;
export const cliBuild = {
  version: manifest.version,
  builtAt: typeof __RAYPX_CLI_BUILT_AT__ === "undefined" ? 0 : __RAYPX_CLI_BUILT_AT__,
};
