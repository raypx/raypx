import { resolve } from "node:path";
import { prepareHerdr } from "../src/runtime/process/herdr-release.ts";

const [output, platform, arch] = process.argv.slice(2);
if (!output) throw new Error("Usage: prepare-herdr.ts <output-directory>");
await prepareHerdr(resolve(output), platform, arch);
