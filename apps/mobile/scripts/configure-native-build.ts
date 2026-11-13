import { appendFile } from "node:fs/promises";

const [platform = process.env.EAS_BUILD_PLATFORM, mode] = process.argv.slice(2);
if (mode !== undefined && mode !== "--unsigned") throw new Error("Unknown native build option.");

// Point the generated projects at Bun so Metro can load this workspace's TypeScript config.
switch (platform) {
  case "android": {
    const file = Bun.file("android/app/build.gradle");
    const source = await file.text();
    const expoBundleCommand = '    bundleCommand = "export:embed"';
    const bunExecutable = '    nodeExecutableAndArgs = ["bun"]';
    if (!source.includes(expoBundleCommand)) {
      throw new Error("Expo's Android build script no longer declares export:embed.");
    }
    let configured = source;
    if (!configured.includes(bunExecutable))
      configured = configured.replace(expoBundleCommand, `${expoBundleCommand}\n${bunExecutable}`);
    // The Expo template signs release bundles with its debug keystore by default.
    const unsignedRelease = "android { buildTypes.release.signingConfig = null }";
    if (mode === "--unsigned" && !configured.includes(unsignedRelease))
      configured += `\n${unsignedRelease}\n`;
    if (configured !== source) await Bun.write(file, configured);
    break;
  }
  case "ios": {
    const path = "ios/.xcode.env.local";
    const file = Bun.file(path);
    const bunExecutable = process.execPath.replaceAll("'", "'\\''");
    const setting = `export NODE_BINARY='${bunExecutable}'`;
    if (!(await file.exists()) || !(await file.text()).trimEnd().endsWith(setting)) {
      await appendFile(path, `\n${setting}\n`);
    }
    break;
  }
  default:
    throw new Error("Native build platform must be android or ios.");
}
